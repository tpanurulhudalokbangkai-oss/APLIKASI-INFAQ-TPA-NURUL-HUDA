/**
 * Rekap.gs
 * Rekap pembayaran dan rekap tunggakan.
 * Fungsi inti (hitung...) sengaja dibuat terpisah dari fungsi publik supaya bisa dipakai ulang
 * oleh rekap tahunan, ekspor Excel/PDF, dan pesan WhatsApp pada tahap berikutnya.
 */

/* ======================== PEMBANTU WAKTU ======================== */

function indeksBulan_(tahun, bulan) {
  return tahun * 12 + bulan;
}

function dariIndeks_(idx) {
  var tahun = Math.floor((idx - 1) / 12);
  return { tahun: tahun, bulan: idx - tahun * 12 };
}

function waktuSekarang_() {
  var zona = APP_CONFIG.ZONA_WAKTU;
  var sekarang = new Date();
  return {
    tahun: Number(Utilities.formatDate(sekarang, zona, 'yyyy')),
    bulan: Number(Utilities.formatDate(sekarang, zona, 'M'))
  };
}

/* ======================== MESIN PERHITUNGAN TUNGGAKAN ======================== */

/**
 * Menghitung bulan tertunggak SATU santri. FUNGSI MURNI: tidak membaca spreadsheet,
 * sehingga aturannya mudah diuji (lihat ujiPerhitunganTunggakan).
 *
 * p.awalIdx        indeks bulan awal penagihan (periode nominal paling awal)
 * p.masukIdx       indeks bulan masuk santri, atau null bila tidak diketahui
 * p.berhentiIdx    indeks bulan terakhir yang masih ditagih (santri nonaktif), atau null bila aktif
 * p.akhirIdx       indeks bulan terakhir yang dihitung
 * p.dibayar        objek {indeks: true} untuk bulan yang sudah dibayar (transaksi sah)
 * p.bebas          daftar {dari, sampai} berisi indeks bulan yang dibebaskan
 * p.riwayatNominal daftar {tahun, bulan, nominal}
 */
function hitungTunggakanSantri_(p) {
  var mulai = p.awalIdx;
  if (p.masukIdx !== null && p.masukIdx > mulai) { mulai = p.masukIdx; }
  var selesai = p.akhirIdx;
  if (p.berhentiIdx !== null && p.berhentiIdx < selesai) { selesai = p.berhentiIdx; }

  var hasil = { bulan: [], jumlah: 0, total: 0 };
  for (var idx = mulai; idx <= selesai; idx++) {
    if (p.dibayar[idx]) { continue; }
    var dibebaskan = p.bebas.some(function (b) { return idx >= b.dari && idx <= b.sampai; });
    if (dibebaskan) { continue; }

    var w = dariIndeks_(idx);
    var nominal = nominalBerlaku_(p.riwayatNominal, w.bulan, w.tahun);
    hasil.bulan.push({ tahun: w.tahun, bulan: w.bulan, nominal: nominal });
    hasil.jumlah++;
    hasil.total += nominal;
  }
  return hasil;
}

/**
 * Membaca filter rekap dan memaksa cakupan sesuai peran.
 * Petugas SELALU dibatasi pada kelompoknya sendiri, apa pun yang dikirim browser.
 */
function normalisasiFilterRekap_(profil, filter, untukTunggakan) {
  filter = (filter && typeof filter === 'object') ? filter : {};
  var sekarang = waktuSekarang_();
  var kosong = function (v) { return v === undefined || v === null || v === ''; };

  var f = {
    idKelompok: profil.role === ROLE_ADMIN ? bersihkanTeks_(filter.idKelompok) : profil.idKelompok,
    kata: bersihkanTeks_(filter.kata).substring(0, 60).toLowerCase()
  };

  if (untukTunggakan) {
    f.tahun = kosong(filter.tahun) ? sekarang.tahun : keBilanganBulat_(filter.tahun, 'Tahun', 2000, sekarang.tahun + 1);
    f.bulan = kosong(filter.bulan) ? sekarang.bulan : keBilanganBulat_(filter.bulan, 'Bulan', 1, 12);
    var status = String(filter.status || 'SEMUA').toUpperCase();
    f.status = (status === 'AKTIF' || status === 'NONAKTIF') ? status : 'SEMUA';
    f.hanyaMenunggak = filter.hanyaMenunggak !== false;
  } else {
    f.tahun = kosong(filter.tahun) ? sekarang.tahun : keBilanganBulat_(filter.tahun, 'Tahun', 0, 2100);
    if (f.tahun !== 0 && f.tahun < 2000) {
      throw buatGalat_('DATA_TIDAK_VALID', 'Tahun tidak valid.');
    }
    f.bulan = kosong(filter.bulan) ? 0 : keBilanganBulat_(filter.bulan, 'Bulan', 0, 12);
  }
  return f;
}

function daftarKelompokCakupan_(profil) {
  var peta = petaKelompok_();
  return Object.keys(peta)
    .map(function (id) { return peta[id]; })
    .filter(function (k) { return profil.role === ROLE_ADMIN || k.id === profil.idKelompok; })
    .sort(function (a, b) { return a.nama.localeCompare(b.nama, 'id'); });
}

/* ======================== REKAP PEMBAYARAN ======================== */

/**
 * Mengumpulkan pembayaran SAH sesuai filter dan cakupan peran.
 */
function hitungRekapPembayaran_(profil, f) {
  var adalahAdmin = profil.role === ROLE_ADMIN;
  var petaKel = petaKelompok_();
  var nisSantri = {};
  bacaTabel_('SANTRI').forEach(function (s) { nisSantri[String(s.ID_SANTRI).trim()] = String(s.NIS).trim(); });

  var setTahun = {};
  setTahun[waktuSekarang_().tahun] = true;
  var baris = [];
  var total = 0;

  bacaTabel_('PEMBAYARAN').forEach(function (p) {
    if (!String(p.ID_PEMBAYARAN).trim() || !transaksiSah_(p)) { return; }
    var idKel = String(p.ID_KELOMPOK).trim();
    if (!adalahAdmin && idKel !== profil.idKelompok) { return; }

    var th = Number(p.TAHUN);
    var bl = Number(p.BULAN);
    if (th > 0) { setTahun[th] = true; }

    if (f.tahun !== 0 && th !== f.tahun) { return; }
    if (f.bulan !== 0 && bl !== f.bulan) { return; }
    if (f.idKelompok && idKel !== f.idKelompok) { return; }

    var idSantri = String(p.ID_SANTRI).trim();
    var nama = String(p.NAMA_SANTRI).trim();
    var nis = nisSantri[idSantri] || '';
    if (f.kata && (nama + ' ' + nis).toLowerCase().indexOf(f.kata) < 0) { return; }

    var nominal = Number(p.NOMINAL) || 0;
    total += nominal;
    baris.push({
      idPembayaran: String(p.ID_PEMBAYARAN).trim(),
      nis: nis,
      nama: nama,
      idKelompok: idKel,
      namaKelompok: petaKel[idKel] ? petaKel[idKel].nama : idKel,
      bulan: bl,
      tahun: th,
      tanggal: formatTanggalIso_(p.TANGGAL_BAYAR),
      nominal: nominal,
      penerima: String(p.PENERIMA).trim()
    });
  });

  baris.sort(function (a, b) {
    var k = a.namaKelompok.localeCompare(b.namaKelompok, 'id');
    if (k !== 0) { return k; }
    var n = a.nama.localeCompare(b.nama, 'id');
    if (n !== 0) { return n; }
    return (a.tahun * 12 + a.bulan) - (b.tahun * 12 + b.bulan);
  });

  return {
    baris: baris,
    total: total,
    jumlah: baris.length,
    tahunTersedia: Object.keys(setTahun).map(Number).sort(function (a, b) { return b - a; }),
    kelompok: daftarKelompokCakupan_(profil)
  };
}

/**
 * Admin: semua kelompok. Petugas: hanya kelompoknya.
 */
function ambilRekapPembayaran(token, filter) {
  try {
    var profil = wajibLogin_(token);
    var f = normalisasiFilterRekap_(profil, filter, false);
    return { berhasil: true, data: hitungRekapPembayaran_(profil, f) };
  } catch (err) {
    return galatKeRespons_(err);
  }
}

/* ======================== REKAP TUNGGAKAN ======================== */

/**
 * Menghitung tunggakan seluruh santri dalam cakupan, dengan semua aturan perhitungan.
 */
function hitungTunggakan_(profil, f) {
  var adalahAdmin = profil.role === ROLE_ADMIN;
  var riwayatNominal = bacaRiwayatNominal_();
  var hasil = {
    baris: [],
    awalPenagihan: null,
    akhirHitung: { bulan: f.bulan, tahun: f.tahun },
    tanpaNominal: riwayatNominal.length === 0,
    tanpaTanggalBerhenti: 0,
    kelompok: daftarKelompokCakupan_(profil)
  };
  if (!riwayatNominal.length) {
    return hasil;
  }

  var awal = riwayatNominal[0];
  var awalIdx = indeksBulan_(awal.tahun, awal.bulan);
  var akhirIdx = indeksBulan_(f.tahun, f.bulan);
  hasil.awalPenagihan = { bulan: awal.bulan, tahun: awal.tahun };

  var petaKel = petaKelompok_();

  // Pembayaran sah per santri (transaksi DIBATALKAN tidak dihitung)
  var dibayar = {};
  bacaTabel_('PEMBAYARAN').forEach(function (p) {
    if (!String(p.ID_PEMBAYARAN).trim() || !transaksiSah_(p)) { return; }
    var bl = Number(p.BULAN);
    var th = Number(p.TAHUN);
    if (!(bl >= 1 && bl <= 12) || !(th >= 2000)) { return; }
    var id = String(p.ID_SANTRI).trim();
    if (!dibayar[id]) { dibayar[id] = {}; }
    dibayar[id][indeksBulan_(th, bl)] = true;
  });

  // Pembebasan: ID_SANTRI kosong atau SEMUA berlaku untuk semua santri
  var bebasUmum = [];
  var bebasSantri = {};
  bacaTabel_('PEMBEBASAN').forEach(function (r) {
    if (!adalahAktif_(r.STATUS_AKTIF)) { return; }
    var dari = indeksBulanDariTanggal_(r.DARI);
    if (dari === null) { return; }
    var sampai = indeksBulanDariTanggal_(r.SAMPAI);
    if (sampai === null) { sampai = dari; }
    var rentang = { dari: dari, sampai: sampai };
    var idS = String(r.ID_SANTRI).trim();
    if (!idS || idS.toUpperCase() === 'SEMUA') {
      bebasUmum.push(rentang);
    } else {
      if (!bebasSantri[idS]) { bebasSantri[idS] = []; }
      bebasSantri[idS].push(rentang);
    }
  });

  bacaTabel_('SANTRI').forEach(function (s) {
    var id = String(s.ID_SANTRI).trim();
    if (!id) { return; }
    var idKel = String(s.ID_KELOMPOK).trim();
    if (!adalahAdmin && idKel !== profil.idKelompok) { return; }
    if (f.idKelompok && idKel !== f.idKelompok) { return; }

    var aktif = adalahAktif_(s.STATUS_AKTIF);
    if (f.status === 'AKTIF' && !aktif) { return; }
    if (f.status === 'NONAKTIF' && aktif) { return; }

    var berhentiIdx = null;
    if (!aktif) {
      berhentiIdx = indeksBulanDariTanggal_(s.TANGGAL_NONAKTIF);
      if (berhentiIdx === null) {
        // Nonaktif tetapi tanggal berhenti tidak tercatat: tidak dapat dihitung
        hasil.tanpaTanggalBerhenti++;
        return;
      }
    }

    var hitung = hitungTunggakanSantri_({
      awalIdx: awalIdx,
      masukIdx: indeksBulanDariTanggal_(s.TANGGAL_MASUK),
      berhentiIdx: berhentiIdx,
      akhirIdx: akhirIdx,
      dibayar: dibayar[id] || {},
      bebas: bebasUmum.concat(bebasSantri[id] || []),
      riwayatNominal: riwayatNominal
    });

    if (f.hanyaMenunggak && hitung.jumlah === 0) { return; }

    var nama = String(s.NAMA_SANTRI).trim();
    var nis = String(s.NIS).trim();
    if (f.kata && (nama + ' ' + nis).toLowerCase().indexOf(f.kata) < 0) { return; }

    hasil.baris.push({
      idSantri: id,
      nis: nis,
      nama: nama,
      idKelompok: idKel,
      namaKelompok: petaKel[idKel] ? petaKel[idKel].nama : idKel,
      aktif: aktif,
      bulanTertunggak: hitung.bulan,
      jumlah: hitung.jumlah,
      total: hitung.total
    });
  });

  hasil.baris.sort(function (a, b) {
    var k = a.namaKelompok.localeCompare(b.namaKelompok, 'id');
    return k !== 0 ? k : a.nama.localeCompare(b.nama, 'id');
  });
  return hasil;
}

/**
 * Admin: semua kelompok. Petugas: hanya kelompoknya.
 * filter: { bulan, tahun, idKelompok, status, hanyaMenunggak, kata }
 */
function ambilRekapTunggakan(token, filter) {
  try {
    var profil = wajibLogin_(token);
    var f = normalisasiFilterRekap_(profil, filter, true);
    return { berhasil: true, data: hitungTunggakan_(profil, f) };
  } catch (err) {
    return galatKeRespons_(err);
  }
}

/* ======================== UJI OTOMATIS ======================== */

/**
 * Menguji aturan perhitungan tunggakan dengan data buatan (tidak membaca spreadsheet).
 * Dijalankan manual dari editor.
 */
function ujiPerhitunganTunggakan() {
  pastikanDijalankanPemilik_();

  var nominal = [
    { tahun: 2026, bulan: 1, nominal: 25000 },
    { tahun: 2026, bulan: 7, nominal: 30000 }
  ];
  var awal = indeksBulan_(2026, 1);
  function i(th, bl) { return indeksBulan_(th, bl); }

  var kasus = [
    {
      nama: 'Dasar: masuk Jan, bayar Jan, dihitung sampai Mar -> Feb dan Mar',
      p: { awalIdx: awal, masukIdx: i(2026, 1), berhentiIdx: null, akhirIdx: i(2026, 3), dibayar: (function () { var d = {}; d[i(2026, 1)] = true; return d; })(), bebas: [], riwayatNominal: nominal },
      jumlah: 2, total: 50000
    },
    {
      nama: 'Masuk Mar: bulan sebelum tanggal masuk tidak dihitung',
      p: { awalIdx: awal, masukIdx: i(2026, 3), berhentiIdx: null, akhirIdx: i(2026, 5), dibayar: {}, bebas: [], riwayatNominal: nominal },
      jumlah: 3, total: 75000
    },
    {
      nama: 'Berhenti Apr: bulan setelah berhenti tidak dihitung',
      p: { awalIdx: awal, masukIdx: i(2026, 1), berhentiIdx: i(2026, 4), akhirIdx: i(2026, 6), dibayar: (function () { var d = {}; d[i(2026, 1)] = true; d[i(2026, 2)] = true; return d; })(), bebas: [], riwayatNominal: nominal },
      jumlah: 2, total: 50000
    },
    {
      nama: 'Pembebasan Feb-Mar: bulan dibebaskan tidak dihitung',
      p: { awalIdx: awal, masukIdx: i(2026, 1), berhentiIdx: null, akhirIdx: i(2026, 4), dibayar: (function () { var d = {}; d[i(2026, 1)] = true; return d; })(), bebas: [{ dari: i(2026, 2), sampai: i(2026, 3) }], riwayatNominal: nominal },
      jumlah: 1, total: 25000
    },
    {
      nama: 'Nominal berubah: Jun 25.000 + Jul 30.000 + Agu 30.000',
      p: { awalIdx: awal, masukIdx: i(2026, 6), berhentiIdx: null, akhirIdx: i(2026, 8), dibayar: {}, bebas: [], riwayatNominal: nominal },
      jumlah: 3, total: 85000
    },
    {
      nama: 'Nominal berubah, Jun sudah dibayar: Jul + Agu = 60.000',
      p: { awalIdx: awal, masukIdx: i(2026, 6), berhentiIdx: null, akhirIdx: i(2026, 8), dibayar: (function () { var d = {}; d[i(2026, 6)] = true; return d; })(), bebas: [], riwayatNominal: nominal },
      jumlah: 2, total: 60000
    },
    {
      nama: 'Tanggal masuk tidak diketahui: mulai dari awal penagihan',
      p: { awalIdx: awal, masukIdx: null, berhentiIdx: null, akhirIdx: i(2026, 2), dibayar: {}, bebas: [], riwayatNominal: nominal },
      jumlah: 2, total: 50000
    },
    {
      nama: 'Batas hitung sebelum awal penagihan: tidak ada tunggakan',
      p: { awalIdx: awal, masukIdx: i(2025, 6), berhentiIdx: null, akhirIdx: i(2025, 12), dibayar: {}, bebas: [], riwayatNominal: nominal },
      jumlah: 0, total: 0
    },
    {
      nama: 'Masuk 2024 (sebelum nominal ada): hanya dihitung mulai awal penagihan',
      p: { awalIdx: awal, masukIdx: i(2024, 5), berhentiIdx: null, akhirIdx: i(2026, 1), dibayar: {}, bebas: [], riwayatNominal: nominal },
      jumlah: 1, total: 25000
    },
    {
      nama: 'Berhenti sebelum masuk: tidak ada tunggakan',
      p: { awalIdx: awal, masukIdx: i(2026, 6), berhentiIdx: i(2026, 3), akhirIdx: i(2026, 8), dibayar: {}, bebas: [], riwayatNominal: nominal },
      jumlah: 0, total: 0
    }
  ];

  var hasil = [];
  kasus.forEach(function (k) {
    var h = hitungTunggakanSantri_(k.p);
    var lulus = h.jumlah === k.jumlah && h.total === k.total;
    hasil.push((lulus ? 'LULUS' : 'GAGAL') + ' - ' + k.nama + ' (hasil: ' + h.jumlah + ' bulan, ' + h.total + ')');
  });

  var sahOk = transaksiSah_({ STATUS_TRANSAKSI: 'SAH' }) === true;
  var batalOk = transaksiSah_({ STATUS_TRANSAKSI: 'DIBATALKAN' }) === false;
  hasil.push((sahOk ? 'LULUS' : 'GAGAL') + ' - transaksi SAH dihitung sebagai pembayaran');
  hasil.push((batalOk ? 'LULUS' : 'GAGAL') + ' - transaksi DIBATALKAN tidak dihitung sebagai pembayaran');

  hasil.forEach(function (b) { Logger.log(b); });
  var gagal = hasil.filter(function (b) { return b.indexOf('GAGAL') === 0; }).length;
  Logger.log(gagal === 0 ? 'HASIL: SEMUA PENGUJIAN LULUS.' : 'HASIL: ' + gagal + ' PENGUJIAN GAGAL. Kirim log ini kepada saya.');
}

/**
 * Membuktikan Petugas tidak bisa melihat rekap kelompok lain walau filter dimanipulasi.
 * Butuh akun petugas_uji yang punya kelompok. Tidak mengubah data apa pun.
 */
function ujiHakAksesTahap7() {
  pastikanDijalankanPemilik_();

  var petugas = cariPenggunaByUsername_('petugas_uji');
  if (!petugas || String(petugas.ROLE).trim().toUpperCase() !== ROLE_PETUGAS) {
    throw new Error('Akun petugas dengan username petugas_uji belum ada. Buat dulu lewat menu Data Petugas.');
  }
  var idKelompok = String(petugas.ID_KELOMPOK).trim();
  if (!idKelompok) {
    throw new Error('Akun petugas_uji belum memiliki kelompok.');
  }

  var idLain = 'KLP-TIDAK-ADA';
  Object.keys(petaKelompok_()).forEach(function (id) { if (id !== idKelompok) { idLain = id; } });

  var token = buatSesi_(String(petugas.ID_PENGGUNA).trim());
  var hasil = [];

  try {
    var rekap = ambilRekapPembayaran(token, { tahun: 0, bulan: 0, idKelompok: idLain });
    var bocor1 = rekap.berhasil && rekap.data.baris.some(function (r) { return r.idKelompok !== idKelompok; });
    hasil.push((rekap.berhasil && !bocor1 ? 'LULUS' : 'GAGAL') + ' - ambilRekapPembayaran dengan filter kelompok lain hanya berisi kelompok sendiri (' +
      (rekap.berhasil ? rekap.data.baris.length : 0) + ' baris)');

    var tunggakan = ambilRekapTunggakan(token, { idKelompok: idLain, status: 'SEMUA', hanyaMenunggak: false });
    var bocor2 = tunggakan.berhasil && tunggakan.data.baris.some(function (r) { return r.idKelompok !== idKelompok; });
    hasil.push((tunggakan.berhasil && !bocor2 ? 'LULUS' : 'GAGAL') + ' - ambilRekapTunggakan dengan filter kelompok lain hanya berisi kelompok sendiri (' +
      (tunggakan.berhasil ? tunggakan.data.baris.length : 0) + ' baris)');

    var daftarKel = tunggakan.berhasil ? tunggakan.data.kelompok : [];
    var kelompokBocor = daftarKel.some(function (k) { return k.id !== idKelompok; });
    hasil.push((!kelompokBocor ? 'LULUS' : 'GAGAL') + ' - daftar kelompok untuk Petugas hanya berisi kelompok sendiri');

    var palsu = ambilRekapPembayaran('abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH', {});
    hasil.push((palsu.berhasil === false && palsu.kode === 'SESI_HABIS' ? 'LULUS' : 'GAGAL') + ' - token palsu ditolak (SESI_HABIS)');
  } finally {
    CacheService.getScriptCache().remove(kunciSesi_(token));
  }

  hasil.forEach(function (b) { Logger.log(b); });
  var gagal = hasil.filter(function (b) { return b.indexOf('GAGAL') === 0; }).length;
  Logger.log(gagal === 0 ? 'HASIL: SEMUA PENGUJIAN LULUS.' : 'HASIL: ' + gagal + ' PENGUJIAN GAGAL. Kirim log ini kepada saya.');
}