/**
 * Pembayaran.gs
 * Input pembayaran, status bulan, riwayat, dan pembatalan transaksi.
 *
 * Aturan keamanan:
 * - Kelompok SELALU dibaca dari data santri di server, bukan dari kiriman browser.
 * - Pembayaran ganda dicegah di dalam LockService.
 * - Transaksi tidak pernah dihapus, hanya diberi status DIBATALKAN dengan alasan.
 * - Semua penambahan dan pembatalan dicatat di sheet RIWAYAT_PERUBAHAN.
 * - Nominal boleh dikosongkan: server memakai nominal standar periode itu.
 */

/* ======================== PEMBANTU ======================== */

function formatRupiahServer_(n) {
  return 'Rp' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Mengubah masukan menjadi bilangan bulat dalam rentang tertentu, atau melempar error.
 */
function keBilanganBulat_(nilai, label, min, maks) {
  var teks = String(nilai === null || nilai === undefined ? '' : nilai).trim();
  if (!/^\d+$/.test(teks)) {
    throw buatGalat_('DATA_TIDAK_VALID', label + ' harus berupa angka bulat positif.');
  }
  var n = Number(teks);
  if (n < min || n > maks) {
    throw buatGalat_('DATA_TIDAK_VALID', label + ' harus antara ' + min + ' dan ' + maks + '.');
  }
  return n;
}

/**
 * Menentukan nominal pembayaran. FUNGSI MURNI (tidak membaca spreadsheet) agar mudah diuji.
 * - masukan kosong  : pakai nominal standar periode itu (error bila belum diatur)
 * - masukan terisi  : harus bilangan bulat 1 sampai 100.000.000
 */
function tentukanNominalPembayaran_(masukan, riwayatNominal, bulan, tahun) {
  var teks = String(masukan === null || masukan === undefined ? '' : masukan).trim();
  if (teks === '') {
    var standar = nominalBerlaku_(riwayatNominal, bulan, tahun);
    if (!(standar > 0)) {
      throw buatGalat_('DATA_TIDAK_VALID', 'Nominal dikosongkan, tetapi nominal standar untuk ' +
        NAMA_BULAN[bulan - 1] + ' ' + tahun + ' belum diatur. Isi nominal secara manual, atau minta Admin mengaturnya di menu Pengaturan.');
    }
    return { nominal: standar, otomatis: true };
  }
  return { nominal: keBilanganBulat_(teks, 'Nominal', 1, 100000000), otomatis: false };
}

/**
 * Mencatat satu kejadian ke sheet RIWAYAT_PERUBAHAN.
 */
function catatRiwayat_(profil, tabel, idData, aksi, detail) {
  var waktu = Utilities.formatDate(new Date(), APP_CONFIG.ZONA_WAKTU, 'yyyy-MM-dd HH:mm:ss');
  tambahBaris_('RIWAYAT_PERUBAHAN', {
    ID_LOG: buatId_('LOG'),
    WAKTU: waktu,
    ID_PENGGUNA: profil.idPengguna,
    NAMA_PENGGUNA: profil.nama,
    TABEL: tabel,
    ID_DATA: idData,
    AKSI: aksi,
    DETAIL: detail
  }, true);
}

/**
 * Versi aman: kegagalan mencatat riwayat tidak menggagalkan transaksi yang sudah tersimpan,
 * tetapi dicatat di log server.
 */
function catatRiwayatAman_(profil, tabel, idData, aksi, detail) {
  try {
    catatRiwayat_(profil, tabel, idData, aksi, detail);
  } catch (err) {
    console.error('Gagal mencatat riwayat perubahan: ' + (err && err.message ? err.message : err));
  }
}

/**
 * Menulis satu baris pembayaran dengan format sel yang tepat:
 * teks untuk ID/tanggal/nama, angka untuk BULAN, TAHUN, NOMINAL.
 */
function tambahPembayaranBaris_(objek) {
  var sheet = ambilSheet_('PEMBAYARAN');
  var header = SKEMA_DATABASE.PEMBAYARAN;
  var baris = header.map(function (k) { return objek[k] === undefined ? '' : objek[k]; });
  var posisi = sheet.getLastRow() + 1;

  sheet.getRange(posisi, 1, 1, 5).setNumberFormat('@');      // A-E: teks
  sheet.getRange(posisi, 6, 1, 2).setNumberFormat('0');      // F-G: BULAN, TAHUN
  sheet.getRange(posisi, 8, 1, 1).setNumberFormat('#,##0');  // H: NOMINAL
  sheet.getRange(posisi, 9, 1, 4).setNumberFormat('@');      // I-L: teks
  sheet.getRange(posisi, 1, 1, header.length).setValues([baris]);
  SpreadsheetApp.flush();
  return posisi;
}

/* ======================== FUNGSI DARI BROWSER ======================== */

/**
 * Bulan-bulan yang sudah dibayar (sah) oleh satu santri pada satu tahun.
 * Admin: semua santri. Petugas: hanya santri kelompoknya.
 */
function ambilStatusBayarSantri(token, idSantri, tahun) {
  try {
    var profil = wajibLogin_(token);
    var th = keBilanganBulat_(tahun, 'Tahun', 2000, 2100);
    idSantri = bersihkanTeks_(idSantri);

    var santri = cariBaris_(bacaTabel_('SANTRI'), 'ID_SANTRI', idSantri);
    if (!santri) {
      throw buatGalat_('DATA_TIDAK_VALID', 'Santri tidak ditemukan.');
    }
    wajibAksesKelompok_(profil, String(santri.ID_KELOMPOK).trim());

    var dibayar = {};
    bacaTabel_('PEMBAYARAN').forEach(function (p) {
      if (String(p.ID_PEMBAYARAN).trim() && transaksiSah_(p) &&
          String(p.ID_SANTRI).trim() === idSantri && Number(p.TAHUN) === th) {
        dibayar[Number(p.BULAN)] = true;
      }
    });
    var daftar = Object.keys(dibayar).map(Number).sort(function (a, b) { return a - b; });
    return { berhasil: true, data: { bulanDibayar: daftar } };
  } catch (err) {
    return galatKeRespons_(err);
  }
}

/**
 * Riwayat pembayaran. Admin: semua kelompok. Petugas: hanya kelompoknya.
 * tahun = 0 berarti semua tahun.
 */
function ambilRiwayatPembayaran(token, tahun) {
  try {
    var profil = wajibLogin_(token);
    var adalahAdmin = profil.role === ROLE_ADMIN;
    var tahunIni = Number(Utilities.formatDate(new Date(), APP_CONFIG.ZONA_WAKTU, 'yyyy'));

    var tahunDipilih = (tahun === undefined || tahun === null || tahun === '')
      ? tahunIni
      : keBilanganBulat_(tahun, 'Tahun', 0, 2100);
    if (tahunDipilih !== 0 && tahunDipilih < 2000) {
      throw buatGalat_('DATA_TIDAK_VALID', 'Tahun tidak valid.');
    }

    var petaKel = petaKelompok_();
    var nisSantri = {};
    bacaTabel_('SANTRI').forEach(function (s) { nisSantri[String(s.ID_SANTRI).trim()] = String(s.NIS).trim(); });
    var namaPengguna = {};
    bacaTabel_('PENGGUNA').forEach(function (u) { namaPengguna[String(u.ID_PENGGUNA).trim()] = String(u.NAMA).trim(); });

    var setTahun = {};
    setTahun[tahunIni] = true;
    var transaksi = [];

    bacaTabel_('PEMBAYARAN').forEach(function (p) {
      var id = String(p.ID_PEMBAYARAN).trim();
      if (!id) { return; }
      var idKel = String(p.ID_KELOMPOK).trim();
      if (!adalahAdmin && idKel !== profil.idKelompok) { return; }

      var th = Number(p.TAHUN);
      if (th > 0) { setTahun[th] = true; }
      if (tahunDipilih !== 0 && th !== tahunDipilih) { return; }

      var idSantri = String(p.ID_SANTRI).trim();
      transaksi.push({
        idPembayaran: id,
        tanggal: formatTanggalIso_(p.TANGGAL_BAYAR),
        idSantri: idSantri,
        nis: nisSantri[idSantri] || '',
        nama: String(p.NAMA_SANTRI).trim(),
        idKelompok: idKel,
        namaKelompok: petaKel[idKel] ? petaKel[idKel].nama : idKel,
        bulan: Number(p.BULAN),
        tahun: th,
        nominal: Number(p.NOMINAL) || 0,
        penerima: String(p.PENERIMA).trim(),
        dicatatOleh: namaPengguna[String(p.ID_PETUGAS_INPUT).trim()] || '',
        catatan: String(p.CATATAN).trim(),
        status: transaksiSah_(p) ? STATUS_TRANSAKSI_SAH : STATUS_TRANSAKSI_BATAL,
        urut: p._baris
      });
    });

    transaksi.sort(function (a, b) {
      if (a.tanggal !== b.tanggal) { return a.tanggal < b.tanggal ? 1 : -1; }
      return b.urut - a.urut;
    });

    var kelompok = Object.keys(petaKel)
      .map(function (id) { return petaKel[id]; })
      .filter(function (k) { return adalahAdmin || k.id === profil.idKelompok; })
      .sort(function (a, b) { return a.nama.localeCompare(b.nama, 'id'); });

    var tahunTersedia = Object.keys(setTahun).map(Number).sort(function (a, b) { return b - a; });

    return {
      berhasil: true,
      data: {
        transaksi: transaksi,
        tahunTersedia: tahunTersedia,
        tahunDipilih: tahunDipilih,
        kelompok: kelompok,
        bolehBatal: adalahAdmin
      }
    };
  } catch (err) {
    return galatKeRespons_(err);
  }
}

/**
 * Menyimpan satu pembayaran bulanan.
 * data.nominal boleh kosong: server memakai nominal standar periode itu.
 */
function simpanPembayaran(token, data) {
  try {
    var profil = wajibLogin_(token);
    if (!data || typeof data !== 'object') {
      throw buatGalat_('DATA_TIDAK_VALID', 'Data pembayaran tidak lengkap.');
    }

    var idSantri = bersihkanTeks_(data.idSantri);
    if (!idSantri) {
      throw buatGalat_('DATA_TIDAK_VALID', 'Pilih santri terlebih dahulu.');
    }
    var santri = cariBaris_(bacaTabel_('SANTRI'), 'ID_SANTRI', idSantri);
    if (!santri) {
      throw buatGalat_('DATA_TIDAK_VALID', 'Santri tidak ditemukan.');
    }

    // HAK AKSES: kelompok diambil dari data santri di server
    var idKelompok = String(santri.ID_KELOMPOK).trim();
    wajibAksesKelompok_(profil, idKelompok);

    if (!adalahAktif_(santri.STATUS_AKTIF)) {
      throw buatGalat_('DATA_TIDAK_VALID', 'Santri nonaktif tidak dapat menerima pembayaran.');
    }

    var zona = APP_CONFIG.ZONA_WAKTU;
    var tahunIni = Number(Utilities.formatDate(new Date(), zona, 'yyyy'));
    var hariIni = Utilities.formatDate(new Date(), zona, 'yyyy-MM-dd');

    var bulan = keBilanganBulat_(data.bulan, 'Bulan', 1, 12);
    var tahun = keBilanganBulat_(data.tahun, 'Tahun', 2000, tahunIni + 1);
    var tanggalBayar = validasiTanggalIso_(data.tanggalBayar, 'Tanggal pembayaran');
    if (tanggalBayar > hariIni) {
      throw buatGalat_('DATA_TIDAK_VALID', 'Tanggal pembayaran tidak boleh melewati hari ini.');
    }

    // Nominal opsional: kosong berarti nominal standar periode itu
    var penentuan = tentukanNominalPembayaran_(data.nominal, bacaRiwayatNominal_(), bulan, tahun);
    var nominal = penentuan.nominal;
    var nominalOtomatis = penentuan.otomatis;

    var penerima = bersihkanTeks_(data.penerima) ? validasiTeks_(data.penerima, 'Nama penerima', 3, 60) : profil.nama;
    var catatan = bersihkanTeks_(data.catatan) ? validasiTeks_(data.catatan, 'Catatan', 1, 200) : '';

    var indeksMasuk = indeksBulanDariTanggal_(santri.TANGGAL_MASUK);
    if (indeksMasuk !== null && tahun * 12 + bulan < indeksMasuk) {
      throw buatGalat_('DATA_TIDAK_VALID', 'Bulan ' + NAMA_BULAN[bulan - 1] + ' ' + tahun +
        ' sebelum tanggal masuk santri, sehingga tidak ditagih. Periksa tanggal masuk santri jika data keliru.');
    }

    return dalamKunci_(function () {
      var namaSantri = String(santri.NAMA_SANTRI).trim();

      // Pemeriksaan pembayaran ganda DI DALAM kunci
      bacaTabel_('PEMBAYARAN').forEach(function (p) {
        if (String(p.ID_PEMBAYARAN).trim() && transaksiSah_(p) &&
            String(p.ID_SANTRI).trim() === idSantri && Number(p.BULAN) === bulan && Number(p.TAHUN) === tahun) {
          throw buatGalat_('DATA_TIDAK_VALID', namaSantri + ' sudah tercatat membayar ' + NAMA_BULAN[bulan - 1] + ' ' + tahun +
            ' (tanggal ' + formatTanggal_(p.TANGGAL_BAYAR) + '). Pembayaran ganda ditolak.');
        }
      });

      var id = buatId_('PAY');
      var posisi = tambahPembayaranBaris_({
        ID_PEMBAYARAN: id,
        TANGGAL_BAYAR: tanggalBayar,
        ID_SANTRI: idSantri,
        NAMA_SANTRI: namaSantri,
        ID_KELOMPOK: idKelompok,
        BULAN: bulan,
        TAHUN: tahun,
        NOMINAL: nominal,
        PENERIMA: penerima,
        ID_PETUGAS_INPUT: profil.idPengguna,
        CATATAN: catatan,
        STATUS_TRANSAKSI: STATUS_TRANSAKSI_SAH
      });

      // Baca ulang untuk memastikan benar-benar tersimpan
      var baca = ambilSheet_('PEMBAYARAN').getRange(posisi, 1, 1, SKEMA_DATABASE.PEMBAYARAN.length).getValues()[0];
      if (String(baca[0]).trim() !== id || Number(baca[5]) !== bulan || Number(baca[6]) !== tahun ||
          Number(baca[7]) !== nominal || String(baca[11]).trim() !== STATUS_TRANSAKSI_SAH) {
        throw new Error('Pembayaran tidak tersimpan dengan benar pada baris ' + posisi + '.');
      }

      catatRiwayatAman_(profil, 'PEMBAYARAN', id, 'TAMBAH',
        'Pembayaran ' + namaSantri + ' ' + NAMA_BULAN[bulan - 1] + ' ' + tahun + ' ' + formatRupiahServer_(nominal) +
        (nominalOtomatis ? ' [nominal standar otomatis]' : '') +
        ', tanggal ' + tanggalBayar + ', penerima ' + penerima);

      return {
        berhasil: true,
        pesan: 'Pembayaran ' + namaSantri + ' untuk ' + NAMA_BULAN[bulan - 1] + ' ' + tahun + ' sebesar ' +
          formatRupiahServer_(nominal) + (nominalOtomatis ? ' (nominal standar)' : '') + ' berhasil disimpan.',
        idPembayaran: id
      };
    });
  } catch (err) {
    return galatKeRespons_(err);
  }
}

/**
 * Membatalkan transaksi (khusus Admin). Tidak menghapus: status menjadi DIBATALKAN.
 */
function batalkanPembayaran(token, idPembayaran, alasan) {
  try {
    var profil = wajibLogin_(token);
    wajibAdmin_(profil);

    idPembayaran = bersihkanTeks_(idPembayaran);
    var alasanBersih = validasiTeks_(alasan, 'Alasan pembatalan', 5, 200);

    return dalamKunci_(function () {
      var p = cariBaris_(bacaTabel_('PEMBAYARAN'), 'ID_PEMBAYARAN', idPembayaran);
      if (!p) {
        throw buatGalat_('DATA_TIDAK_VALID', 'Transaksi tidak ditemukan.');
      }
      if (!transaksiSah_(p)) {
        throw buatGalat_('DATA_TIDAK_VALID', 'Transaksi ini sudah dibatalkan sebelumnya.');
      }

      var hariIni = Utilities.formatDate(new Date(), APP_CONFIG.ZONA_WAKTU, 'yyyy-MM-dd');
      var catatanLama = String(p.CATATAN).trim();
      var catatanBaru = (catatanLama ? catatanLama + ' | ' : '') +
        'DIBATALKAN ' + hariIni + ' oleh ' + profil.nama + ': ' + alasanBersih;

      perbaruiBaris_('PEMBAYARAN', p._baris, {
        STATUS_TRANSAKSI: STATUS_TRANSAKSI_BATAL,
        CATATAN: catatanBaru
      }, false);

      var nama = String(p.NAMA_SANTRI).trim();
      var periode = NAMA_BULAN[Number(p.BULAN) - 1] + ' ' + Number(p.TAHUN);
      catatRiwayatAman_(profil, 'PEMBAYARAN', idPembayaran, 'BATAL',
        'Pembatalan pembayaran ' + nama + ' ' + periode + ' ' + formatRupiahServer_(p.NOMINAL) + '. Alasan: ' + alasanBersih);

      return {
        berhasil: true,
        pesan: 'Transaksi ' + nama + ' (' + periode + ') berhasil dibatalkan.'
      };
    });
  } catch (err) {
    return galatKeRespons_(err);
  }
}

/* ======================== UJI OTOMATIS ======================== */

/**
 * Menguji aturan nominal opsional dengan data buatan (tidak membaca spreadsheet).
 * Dijalankan manual dari editor.
 */
function ujiNominalOpsional() {
  pastikanDijalankanPemilik_();

  var riwayat = [
    { tahun: 2026, bulan: 1, nominal: 25000 },
    { tahun: 2026, bulan: 7, nominal: 30000 }
  ];

  var kasus = [
    { nama: 'Kosong, Maret 2026 -> nominal standar 25.000', masukan: '', riwayat: riwayat, bulan: 3, tahun: 2026, harapan: { nominal: 25000, otomatis: true } },
    { nama: 'Hanya spasi, Agustus 2026 -> nominal standar 30.000 (periode berubah)', masukan: '   ', riwayat: riwayat, bulan: 8, tahun: 2026, harapan: { nominal: 30000, otomatis: true } },
    { nama: 'Tidak diisi (undefined), Januari 2026 -> 25.000', masukan: undefined, riwayat: riwayat, bulan: 1, tahun: 2026, harapan: { nominal: 25000, otomatis: true } },
    { nama: 'Kosong, Desember 2025 (sebelum nominal ada) -> ditolak', masukan: '', riwayat: riwayat, bulan: 12, tahun: 2025, harapan: 'GALAT' },
    { nama: 'Kosong, belum ada nominal sama sekali -> ditolak', masukan: '', riwayat: [], bulan: 3, tahun: 2026, harapan: 'GALAT' },
    { nama: 'Diisi 20000 -> dipakai apa adanya', masukan: '20000', riwayat: riwayat, bulan: 3, tahun: 2026, harapan: { nominal: 20000, otomatis: false } },
    { nama: 'Diisi angka 25000 (bertipe angka) -> dipakai', masukan: 25000, riwayat: riwayat, bulan: 3, tahun: 2026, harapan: { nominal: 25000, otomatis: false } },
    { nama: 'Diisi 0 -> ditolak (bukan dianggap kosong)', masukan: '0', riwayat: riwayat, bulan: 3, tahun: 2026, harapan: 'GALAT' },
    { nama: 'Diisi abc -> ditolak', masukan: 'abc', riwayat: riwayat, bulan: 3, tahun: 2026, harapan: 'GALAT' },
    { nama: 'Diisi desimal 25000.5 -> ditolak', masukan: '25000.5', riwayat: riwayat, bulan: 3, tahun: 2026, harapan: 'GALAT' },
    { nama: 'Diisi di atas batas 100 juta -> ditolak', masukan: '100000001', riwayat: riwayat, bulan: 3, tahun: 2026, harapan: 'GALAT' }
  ];

  var hasil = [];
  kasus.forEach(function (k) {
    var lulus;
    var keterangan;
    try {
      var h = tentukanNominalPembayaran_(k.masukan, k.riwayat, k.bulan, k.tahun);
      keterangan = h.nominal + (h.otomatis ? ' (otomatis)' : ' (manual)');
      lulus = k.harapan !== 'GALAT' && h.nominal === k.harapan.nominal && h.otomatis === k.harapan.otomatis;
    } catch (err) {
      keterangan = 'ditolak';
      lulus = k.harapan === 'GALAT';
    }
    hasil.push((lulus ? 'LULUS' : 'GAGAL') + ' - ' + k.nama + ' [hasil: ' + keterangan + ']');
  });

  hasil.forEach(function (b) { Logger.log(b); });
  var gagal = hasil.filter(function (b) { return b.indexOf('GAGAL') === 0; }).length;
  Logger.log(gagal === 0 ? 'HASIL: SEMUA PENGUJIAN LULUS.' : 'HASIL: ' + gagal + ' PENGUJIAN GAGAL. Kirim log ini kepada saya.');
}

/**
 * Membuktikan bahwa Petugas DITOLAK untuk fungsi Admin dan untuk data kelompok lain.
 * Dijalankan manual dari editor. Butuh akun petugas_uji yang sudah punya kelompok.
 * Idealnya sudah ada santri di kelompok lain agar uji akses lintas kelompok ikut berjalan.
 */
function ujiHakAksesTahap6() {
  pastikanDijalankanPemilik_();

  var petugas = cariPenggunaByUsername_('petugas_uji');
  if (!petugas || String(petugas.ROLE).trim().toUpperCase() !== ROLE_PETUGAS) {
    throw new Error('Akun petugas dengan username petugas_uji belum ada. Buat dulu lewat menu Data Petugas.');
  }
  var idKelompok = String(petugas.ID_KELOMPOK).trim();
  if (!idKelompok) {
    throw new Error('Akun petugas_uji belum memiliki kelompok.');
  }

  var token = buatSesi_(String(petugas.ID_PENGGUNA).trim());
  var hasil = [];

  function periksa(nama, respons, kodeDiharapkan) {
    var lulus = respons && respons.berhasil === false && respons.kode === kodeDiharapkan;
    var keterangan = !respons ? 'tidak ada respons' : (respons.berhasil ? 'DITERIMA (seharusnya ditolak)' : respons.kode);
    hasil.push((lulus ? 'LULUS' : 'GAGAL') + ' - ' + nama + ' -> ' + keterangan);
  }

  try {
    periksa('simpanNominalInfaq', simpanNominalInfaq(token, { nominal: 25000, bulan: 1, tahun: 2026 }), 'DILARANG');
    periksa('batalkanPembayaran', batalkanPembayaran(token, 'x', 'alasan pengujian'), 'DILARANG');

    var lain = null;
    bacaTabel_('SANTRI').forEach(function (s) {
      if (!lain && String(s.ID_SANTRI).trim() && String(s.ID_KELOMPOK).trim() !== idKelompok) { lain = s; }
    });
    if (lain) {
      var idLain = String(lain.ID_SANTRI).trim();
      periksa('simpanPembayaran santri kelompok lain',
        simpanPembayaran(token, { idSantri: idLain, bulan: 1, tahun: 2000, tanggalBayar: '2000-01-01', nominal: '1000', penerima: 'Uji', catatan: '' }),
        'DILARANG');
      periksa('simpanPembayaran santri kelompok lain dengan nominal kosong',
        simpanPembayaran(token, { idSantri: idLain, bulan: 1, tahun: 2000, tanggalBayar: '2000-01-01', nominal: '', penerima: 'Uji', catatan: '' }),
        'DILARANG');
      periksa('ambilStatusBayarSantri santri kelompok lain', ambilStatusBayarSantri(token, idLain, 2026), 'DILARANG');
    } else {
      hasil.push('LEWATI - tidak ada santri di kelompok lain, uji akses lintas kelompok dilewati.');
    }

    periksa('ambilRiwayatPembayaran dengan token palsu',
      ambilRiwayatPembayaran('abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH', 0), 'SESI_HABIS');

    var riwayat = ambilRiwayatPembayaran(token, 0);
    var jumlah = riwayat.berhasil ? riwayat.data.transaksi.length : 0;
    var bocor = riwayat.berhasil && riwayat.data.transaksi.some(function (t) { return t.idKelompok !== idKelompok; });
    hasil.push((riwayat.berhasil && !bocor ? 'LULUS' : 'GAGAL') +
      ' - ambilRiwayatPembayaran hanya berisi transaksi kelompok sendiri (' + jumlah + ' transaksi)');
  } finally {
    CacheService.getScriptCache().remove(kunciSesi_(token));
  }

  hasil.forEach(function (baris) { Logger.log(baris); });
  var gagal = hasil.filter(function (b) { return b.indexOf('GAGAL') === 0; }).length;
  Logger.log(gagal === 0 ? 'HASIL: SEMUA PENGUJIAN LULUS.' : 'HASIL: ' + gagal + ' PENGUJIAN GAGAL. Kirim log ini kepada saya.');
}