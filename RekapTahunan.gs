/**
 * RekapTahunan.gs
 * Rekap tahunan Januari sampai Desember seluruh santri (KHUSUS ADMIN).
 * Aturan hitung sama dengan rekap tunggakan (Rekap.gs), ditambah status per bulan.
 * Fungsi inti dipisahkan agar bisa dipakai ulang untuk ekspor Excel dan PDF.
 */

/* ======================== MESIN PERHITUNGAN ======================== */

/**
 * Status 12 bulan satu santri pada satu tahun. FUNGSI MURNI (tidak membaca spreadsheet).
 *
 * p.tahun          tahun yang ditampilkan
 * p.awalIdx        indeks bulan awal penagihan (periode nominal paling awal)
 * p.masukIdx       indeks bulan masuk santri, atau null bila tidak diketahui
 * p.berhentiIdx    indeks bulan terakhir yang masih ditagih (santri nonaktif), atau null bila aktif
 * p.batasIdx       indeks bulan terakhir yang sudah jatuh tempo (bulan berjalan atau Desember tahun itu)
 * p.dibayar        objek {indeks: nominal} untuk bulan yang sudah dibayar (transaksi sah)
 * p.bebas          daftar {dari, sampai} berisi indeks bulan yang dibebaskan
 * p.riwayatNominal daftar {tahun, bulan, nominal}
 *
 * Status per bulan: LUNAS, BELUM_BAYAR, BEBAS, TIDAK_DITAGIH, BELUM_JATUH_TEMPO
 */
function hitungStatusTahunanSantri_(p) {
  var mulai = p.awalIdx;
  if (p.masukIdx !== null && p.masukIdx > mulai) { mulai = p.masukIdx; }

  var hasil = { status: [], nominal: [], totalBayar: 0, totalTunggakan: 0, jumlahTunggakan: 0 };

  for (var bl = 1; bl <= 12; bl++) {
    var idx = indeksBulan_(p.tahun, bl);
    var status;
    var nominal = 0;

    if (Object.prototype.hasOwnProperty.call(p.dibayar, idx)) {
      status = 'LUNAS';
      nominal = p.dibayar[idx];
      hasil.totalBayar += nominal;
    } else if (idx < mulai || (p.berhentiIdx !== null && idx > p.berhentiIdx)) {
      status = 'TIDAK_DITAGIH';
    } else if (p.bebas.some(function (b) { return idx >= b.dari && idx <= b.sampai; })) {
      status = 'BEBAS';
    } else if (idx > p.batasIdx) {
      status = 'BELUM_JATUH_TEMPO';
    } else {
      status = 'BELUM_BAYAR';
      var w = dariIndeks_(idx);
      nominal = nominalBerlaku_(p.riwayatNominal, w.bulan, w.tahun);
      hasil.totalTunggakan += nominal;
      hasil.jumlahTunggakan++;
    }

    hasil.status.push(status);
    hasil.nominal.push(nominal);
  }
  return hasil;
}

/**
 * Membaca pembebasan aktif dari sheet PEMBEBASAN.
 * ID_SANTRI kosong atau SEMUA berlaku untuk semua santri.
 */
function bacaPembebasan_() {
  var hasil = { umum: [], perSantri: {} };
  bacaTabel_('PEMBEBASAN').forEach(function (r) {
    if (!adalahAktif_(r.STATUS_AKTIF)) { return; }
    var dari = indeksBulanDariTanggal_(r.DARI);
    if (dari === null) { return; }
    var sampai = indeksBulanDariTanggal_(r.SAMPAI);
    if (sampai === null) { sampai = dari; }
    var rentang = { dari: dari, sampai: sampai };
    var idS = String(r.ID_SANTRI).trim();
    if (!idS || idS.toUpperCase() === 'SEMUA') {
      hasil.umum.push(rentang);
    } else {
      if (!hasil.perSantri[idS]) { hasil.perSantri[idS] = []; }
      hasil.perSantri[idS].push(rentang);
    }
  });
  return hasil;
}

function normalisasiFilterTahunan_(filter) {
  filter = (filter && typeof filter === 'object') ? filter : {};
  var sekarang = waktuSekarang_();
  var kosong = filter.tahun === undefined || filter.tahun === null || filter.tahun === '';
  return {
    tahun: kosong ? sekarang.tahun : keBilanganBulat_(filter.tahun, 'Tahun', 2000, sekarang.tahun + 1),
    idKelompok: bersihkanTeks_(filter.idKelompok)
  };
}

/**
 * Menyusun rekap tahunan seluruh santri (semua kelompok atau satu kelompok).
 * Baris yang seluruh bulannya TIDAK_DITAGIH tidak ditampilkan.
 */
function hitungRekapTahunan_(f) {
  var sekarang = waktuSekarang_();
  var batasIdx = Math.min(indeksBulan_(f.tahun, 12), indeksBulan_(sekarang.tahun, sekarang.bulan));
  var riwayatNominal = bacaRiwayatNominal_();
  var adaNominal = riwayatNominal.length > 0;
  var awalIdx = adaNominal
    ? indeksBulan_(riwayatNominal[0].tahun, riwayatNominal[0].bulan)
    : Number.MAX_SAFE_INTEGER;
  var petaKel = petaKelompok_();
  var pembebasan = bacaPembebasan_();

  // Pembayaran sah pada tahun yang dipilih, per santri
  var dibayar = {};
  bacaTabel_('PEMBAYARAN').forEach(function (p) {
    if (!String(p.ID_PEMBAYARAN).trim() || !transaksiSah_(p)) { return; }
    var th = Number(p.TAHUN);
    var bl = Number(p.BULAN);
    if (th !== f.tahun || !(bl >= 1 && bl <= 12)) { return; }
    var id = String(p.ID_SANTRI).trim();
    if (!dibayar[id]) { dibayar[id] = {}; }
    var idx = indeksBulan_(th, bl);
    dibayar[id][idx] = (dibayar[id][idx] || 0) + (Number(p.NOMINAL) || 0);
  });

  var hasil = {
    tahun: f.tahun,
    bulanBerjalan: sekarang.bulan,
    tahunBerjalan: sekarang.tahun,
    baris: [],
    totalPerBulan: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    totalTahunan: 0,
    totalTunggakan: 0,
    tanpaNominal: !adaNominal,
    awalPenagihan: adaNominal ? { bulan: riwayatNominal[0].bulan, tahun: riwayatNominal[0].tahun } : null,
    tanpaTanggalBerhenti: 0,
    kelompok: Object.keys(petaKel)
      .map(function (id) { return petaKel[id]; })
      .sort(function (a, b) { return a.nama.localeCompare(b.nama, 'id'); })
  };

  bacaTabel_('SANTRI').forEach(function (s) {
    var id = String(s.ID_SANTRI).trim();
    if (!id) { return; }
    var idKel = String(s.ID_KELOMPOK).trim();
    if (f.idKelompok && idKel !== f.idKelompok) { return; }

    var aktif = adalahAktif_(s.STATUS_AKTIF);
    var berhentiIdx = null;
    var tanpaTanggal = false;
    if (!aktif) {
      berhentiIdx = indeksBulanDariTanggal_(s.TANGGAL_NONAKTIF);
      if (berhentiIdx === null) {
        // Tanggal berhenti tidak tercatat: hanya pembayaran yang tampil, tanpa tagihan
        berhentiIdx = 0;
        tanpaTanggal = true;
      }
    }

    var hitung = hitungStatusTahunanSantri_({
      tahun: f.tahun,
      awalIdx: awalIdx,
      masukIdx: indeksBulanDariTanggal_(s.TANGGAL_MASUK),
      berhentiIdx: berhentiIdx,
      batasIdx: batasIdx,
      dibayar: dibayar[id] || {},
      bebas: pembebasan.umum.concat(pembebasan.perSantri[id] || []),
      riwayatNominal: riwayatNominal
    });

    var relevan = hitung.status.some(function (st) { return st !== 'TIDAK_DITAGIH'; });
    if (!relevan) { return; }
    if (tanpaTanggal) { hasil.tanpaTanggalBerhenti++; }

    hitung.nominal.forEach(function (n, i) {
      if (hitung.status[i] === 'LUNAS') { hasil.totalPerBulan[i] += n; }
    });
    hasil.totalTunggakan += hitung.totalTunggakan;

    hasil.baris.push({
      idSantri: id,
      nis: String(s.NIS).trim(),
      nama: String(s.NAMA_SANTRI).trim(),
      idKelompok: idKel,
      namaKelompok: petaKel[idKel] ? petaKel[idKel].nama : idKel,
      aktif: aktif,
      status: hitung.status,
      nominal: hitung.nominal,
      totalBayar: hitung.totalBayar,
      totalTunggakan: hitung.totalTunggakan,
      jumlahTunggakan: hitung.jumlahTunggakan
    });
  });

  hasil.baris.sort(function (a, b) {
    var k = a.namaKelompok.localeCompare(b.namaKelompok, 'id');
    return k !== 0 ? k : a.nama.localeCompare(b.nama, 'id');
  });
  hasil.totalTahunan = hasil.totalPerBulan.reduce(function (a, b) { return a + b; }, 0);
  return hasil;
}

/**
 * KHUSUS ADMIN. Petugas ditolak (DILARANG) oleh server.
 */
function ambilRekapTahunan(token, filter) {
  try {
    var profil = wajibLogin_(token);
    wajibAdmin_(profil);
    var f = normalisasiFilterTahunan_(filter);
    return { berhasil: true, data: hitungRekapTahunan_(f) };
  } catch (err) {
    return galatKeRespons_(err);
  }
}

/* ======================== UJI OTOMATIS ======================== */

/**
 * Menguji aturan status tahunan dengan data buatan, mencocokkannya dengan mesin tunggakan
 * (Rekap.gs), lalu memeriksa kesesuaian total dengan data nyata di spreadsheet (hanya membaca).
 * Dijalankan manual dari editor.
 */
function ujiRekapTahunan() {
  pastikanDijalankanPemilik_();

  var nominal = [
    { tahun: 2026, bulan: 1, nominal: 25000 },
    { tahun: 2026, bulan: 7, nominal: 30000 }
  ];
  var awal = indeksBulan_(2026, 1);
  var batasMei = indeksBulan_(2026, 5);
  function i(th, bl) { return indeksBulan_(th, bl); }
  function dibayar(daftar) {
    var d = {};
    daftar.forEach(function (x) { d[i(x[0], x[1])] = x[2]; });
    return d;
  }
  var KODE = { LUNAS: 'L', BELUM_BAYAR: 'B', TIDAK_DITAGIH: 'T', BEBAS: 'F', BELUM_JATUH_TEMPO: 'J' };

  var kasus = [
    {
      nama: 'Ahmad: masuk Jan, bayar Jan dan Feb, batas Mei',
      p: { tahun: 2026, awalIdx: awal, masukIdx: i(2026, 1), berhentiIdx: null, batasIdx: batasMei, dibayar: dibayar([[2026, 1, 25000], [2026, 2, 25000]]), bebas: [], riwayatNominal: nominal },
      kode: 'LLBBBJJJJJJJ', bayar: 50000, tunggak: 75000
    },
    {
      nama: 'Fatimah: masuk Mar, belum bayar, Jan-Feb tidak ditagih',
      p: { tahun: 2026, awalIdx: awal, masukIdx: i(2026, 3), berhentiIdx: null, batasIdx: batasMei, dibayar: {}, bebas: [], riwayatNominal: nominal },
      kode: 'TTBBBJJJJJJJ', bayar: 0, tunggak: 75000
    },
    {
      nama: 'Umar: berhenti Mar, bulan sesudahnya tidak ditagih',
      p: { tahun: 2026, awalIdx: awal, masukIdx: i(2026, 1), berhentiIdx: i(2026, 3), batasIdx: batasMei, dibayar: dibayar([[2026, 1, 25000]]), bebas: [], riwayatNominal: nominal },
      kode: 'LBBTTTTTTTTT', bayar: 25000, tunggak: 50000
    },
    {
      nama: 'Pembebasan April: April berstatus Bebas dan tidak ditagih',
      p: { tahun: 2026, awalIdx: awal, masukIdx: i(2026, 1), berhentiIdx: null, batasIdx: batasMei, dibayar: dibayar([[2026, 1, 25000], [2026, 2, 25000]]), bebas: [{ dari: i(2026, 4), sampai: i(2026, 4) }], riwayatNominal: nominal },
      kode: 'LLBFBJJJJJJJ', bayar: 50000, tunggak: 50000
    },
    {
      nama: 'Nominal berubah: Jun 25.000, Jul 30.000, Agu 30.000 (batas Agustus)',
      p: { tahun: 2026, awalIdx: awal, masukIdx: i(2026, 6), berhentiIdx: null, batasIdx: i(2026, 8), dibayar: {}, bebas: [], riwayatNominal: nominal },
      kode: 'TTTTTBBBJJJJ', bayar: 0, tunggak: 85000
    },
    {
      nama: 'Tahun 2025 (sebelum awal penagihan): semua tidak ditagih',
      p: { tahun: 2025, awalIdx: awal, masukIdx: i(2024, 5), berhentiIdx: null, batasIdx: i(2025, 12), dibayar: {}, bebas: [], riwayatNominal: nominal },
      kode: 'TTTTTTTTTTTT', bayar: 0, tunggak: 0
    },
    {
      nama: 'Tahun 2027 (belum tiba): semua belum jatuh tempo',
      p: { tahun: 2027, awalIdx: awal, masukIdx: i(2026, 1), berhentiIdx: null, batasIdx: batasMei, dibayar: {}, bebas: [], riwayatNominal: nominal },
      kode: 'JJJJJJJJJJJJ', bayar: 0, tunggak: 0
    },
    {
      nama: 'Bayar di muka: Desember sudah lunas walau belum jatuh tempo',
      p: { tahun: 2026, awalIdx: awal, masukIdx: i(2026, 1), berhentiIdx: null, batasIdx: batasMei, dibayar: dibayar([[2026, 12, 25000]]), bebas: [], riwayatNominal: nominal },
      kode: 'BBBBBJJJJJJL', bayar: 25000, tunggak: 125000
    },
    {
      nama: 'Pembayaran sebelum tanggal masuk tetap tampil Lunas',
      p: { tahun: 2026, awalIdx: awal, masukIdx: i(2026, 3), berhentiIdx: null, batasIdx: i(2026, 3), dibayar: dibayar([[2026, 1, 25000]]), bebas: [], riwayatNominal: nominal },
      kode: 'LTBJJJJJJJJJ', bayar: 25000, tunggak: 25000
    }
  ];

  var hasil = [];
  kasus.forEach(function (k) {
    var h = hitungStatusTahunanSantri_(k.p);
    var kode = h.status.map(function (s) { return KODE[s]; }).join('');
    var lulus = kode === k.kode && h.totalBayar === k.bayar && h.totalTunggakan === k.tunggak;
    hasil.push((lulus ? 'LULUS' : 'GAGAL') + ' - ' + k.nama + ' [' + kode + ', bayar ' + h.totalBayar + ', tunggakan ' + h.totalTunggakan + ']');

    // Pencocokan dengan mesin tunggakan Tahap 7
    var dibayarMesin = {};
    Object.keys(k.p.dibayar).forEach(function (key) { dibayarMesin[key] = true; });
    var mesin = hitungTunggakanSantri_({
      awalIdx: Math.max(k.p.awalIdx, i(k.p.tahun, 1)),
      masukIdx: k.p.masukIdx,
      berhentiIdx: k.p.berhentiIdx,
      akhirIdx: k.p.batasIdx,
      dibayar: dibayarMesin,
      bebas: k.p.bebas,
      riwayatNominal: k.p.riwayatNominal
    });
    var cocok = mesin.total === h.totalTunggakan && mesin.jumlah === h.jumlahTunggakan;
    hasil.push((cocok ? 'LULUS' : 'GAGAL') + '   (sama dengan mesin Rekap Tunggakan: ' + mesin.jumlah + ' bulan, ' + mesin.total + ')');
  });

  // Pemeriksaan data nyata (hanya membaca)
  var tahunIni = waktuSekarang_().tahun;
  var nyata = hitungRekapTahunan_({ tahun: tahunIni, idKelompok: '' });
  var jumlahPerBulan = nyata.totalPerBulan.reduce(function (a, b) { return a + b; }, 0);
  hasil.push((jumlahPerBulan === nyata.totalTahunan ? 'LULUS' : 'GAGAL') +
    ' - data nyata ' + tahunIni + ': total per bulan sama dengan total tahunan (' + nyata.totalTahunan + ', ' + nyata.baris.length + ' santri)');

  var rekapBayar = hitungRekapPembayaran_({ role: ROLE_ADMIN, idKelompok: '' }, { tahun: tahunIni, bulan: 0, idKelompok: '', kata: '' });
  hasil.push((rekapBayar.total === nyata.totalTahunan ? 'LULUS' : 'GAGAL') +
    ' - data nyata ' + tahunIni + ': total tahunan (' + nyata.totalTahunan + ') sama dengan total Rekap Pembayaran (' + rekapBayar.total + ')');

  hasil.forEach(function (b) { Logger.log(b); });
  var gagal = hasil.filter(function (b) { return b.indexOf('GAGAL') === 0; }).length;
  Logger.log(gagal === 0 ? 'HASIL: SEMUA PENGUJIAN LULUS.' : 'HASIL: ' + gagal + ' PENGUJIAN GAGAL. Kirim log ini kepada saya.');
}

/**
 * Membuktikan Petugas ditolak untuk Rekap Tahunan. Butuh akun petugas_uji yang punya kelompok.
 * Tidak mengubah data apa pun.
 */
function ujiHakAksesTahap8() {
  pastikanDijalankanPemilik_();

  var petugas = cariPenggunaByUsername_('petugas_uji');
  if (!petugas || String(petugas.ROLE).trim().toUpperCase() !== ROLE_PETUGAS) {
    throw new Error('Akun petugas dengan username petugas_uji belum ada. Buat dulu lewat menu Data Petugas.');
  }
  if (!String(petugas.ID_KELOMPOK).trim()) {
    throw new Error('Akun petugas_uji belum memiliki kelompok.');
  }

  var token = buatSesi_(String(petugas.ID_PENGGUNA).trim());
  var hasil = [];

  try {
    var a = ambilRekapTahunan(token, { tahun: waktuSekarang_().tahun, idKelompok: '' });
    hasil.push((a.berhasil === false && a.kode === 'DILARANG' ? 'LULUS' : 'GAGAL') + ' - ambilRekapTahunan oleh Petugas -> ' + (a.berhasil ? 'DITERIMA (seharusnya ditolak)' : a.kode));

    var b = ambilRekapTahunan('abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH', {});
    hasil.push((b.berhasil === false && b.kode === 'SESI_HABIS' ? 'LULUS' : 'GAGAL') + ' - ambilRekapTahunan dengan token palsu -> ' + (b.berhasil ? 'DITERIMA' : b.kode));
  } finally {
    CacheService.getScriptCache().remove(kunciSesi_(token));
  }

  hasil.forEach(function (x) { Logger.log(x); });
  var gagal = hasil.filter(function (x) { return x.indexOf('GAGAL') === 0; }).length;
  Logger.log(gagal === 0 ? 'HASIL: SEMUA PENGUJIAN LULUS.' : 'HASIL: ' + gagal + ' PENGUJIAN GAGAL. Kirim log ini kepada saya.');
}