/**
 * Utilitas.gs
 * Fungsi bantu bersama: kunci, validasi input, pembaruan baris, pencatatan perubahan data,
 * dan uji otomatis hak akses Tahap 5.
 */

/**
 * Menjalankan fungsi di dalam kunci supaya dua pengguna tidak menulis bersamaan.
 */
function dalamKunci_(fungsi) {
  var kunci = LockService.getScriptLock();
  kunci.waitLock(15000);
  try {
    return fungsi();
  } finally {
    kunci.releaseLock();
  }
}

/**
 * Membersihkan teks: membuang karakter kontrol dan merapikan spasi.
 */
function bersihkanTeks_(nilai) {
  return String(nilai === null || nilai === undefined ? '' : nilai)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Validasi teks bebas (nama dan sejenisnya).
 * Menolak awalan = + - @ untuk mencegah teks dibaca sebagai rumus spreadsheet.
 */
function validasiTeks_(nilai, label, min, maks) {
  var t = bersihkanTeks_(nilai);
  if (t.length < min) {
    throw buatGalat_('DATA_TIDAK_VALID', label + (min <= 1 ? ' wajib diisi.' : ' wajib diisi, minimal ' + min + ' karakter.'));
  }
  if (t.length > maks) {
    throw buatGalat_('DATA_TIDAK_VALID', label + ' maksimal ' + maks + ' karakter.');
  }
  if (/^[=+\-@]/.test(t)) {
    throw buatGalat_('DATA_TIDAK_VALID', label + ' tidak boleh diawali tanda = + - atau @.');
  }
  return t;
}

function validasiNis_(nilai) {
  var nis = bersihkanTeks_(nilai);
  if (!/^[A-Za-z0-9._\/-]{1,20}$/.test(nis)) {
    throw buatGalat_('DATA_TIDAK_VALID', 'NIS wajib diisi, maksimal 20 karakter (huruf, angka, titik, garis miring, atau strip).');
  }
  return nis;
}

/**
 * Mengubah nomor WhatsApp menjadi format internasional tanpa plus.
 * Contoh: 0812-3456-7890 menjadi 6281234567890
 */
function normalisasiNomorWa_(nilai) {
  var angka = String(nilai === null || nilai === undefined ? '' : nilai).replace(/[\s\-().+]/g, '');
  if (!/^\d+$/.test(angka)) {
    throw buatGalat_('DATA_TIDAK_VALID', 'Nomor WhatsApp wajib diisi dan hanya boleh berisi angka.');
  }
  if (angka.indexOf('620') === 0) {
    angka = '62' + angka.substring(3);
  } else if (angka.indexOf('0') === 0) {
    angka = '62' + angka.substring(1);
  } else if (angka.indexOf('62') !== 0) {
    throw buatGalat_('DATA_TIDAK_VALID', 'Nomor WhatsApp harus diawali 0 atau 62 (contoh: 081234567890).');
  }
  if (angka.length < 10 || angka.length > 15) {
    throw buatGalat_('DATA_TIDAK_VALID', 'Panjang nomor WhatsApp tidak wajar. Periksa kembali nomornya.');
  }
  return angka;
}

/**
 * Memastikan tanggal berformat yyyy-MM-dd dan benar-benar ada di kalender.
 */
function validasiTanggalIso_(nilai, label) {
  var t = String(nilai === null || nilai === undefined ? '' : nilai).trim();
  var m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    throw buatGalat_('DATA_TIDAK_VALID', label + ' wajib diisi dengan tanggal yang valid.');
  }
  var th = Number(m[1]);
  var bl = Number(m[2]);
  var hr = Number(m[3]);
  var d = new Date(th, bl - 1, hr);
  if (d.getFullYear() !== th || d.getMonth() !== bl - 1 || d.getDate() !== hr) {
    throw buatGalat_('DATA_TIDAK_VALID', label + ' tidak valid.');
  }
  var tahunIni = Number(Utilities.formatDate(new Date(), APP_CONFIG.ZONA_WAKTU, 'yyyy'));
  if (th < 2000 || th > tahunIni + 1) {
    throw buatGalat_('DATA_TIDAK_VALID', label + ' di luar rentang yang wajar.');
  }
  return t;
}

/**
 * Mengubah nilai tanggal dari sheet (Date atau teks) menjadi teks yyyy-MM-dd.
 */
function formatTanggalIso_(nilai) {
  if (nilai instanceof Date && !isNaN(nilai.getTime())) {
    return Utilities.formatDate(nilai, APP_CONFIG.ZONA_WAKTU, 'yyyy-MM-dd');
  }
  return String(nilai === null || nilai === undefined ? '' : nilai).trim();
}

/**
 * Mencari satu baris dalam daftar hasil bacaTabel_ berdasarkan nilai suatu kolom.
 */
function cariBaris_(daftar, kolom, nilai) {
  var target = String(nilai === null || nilai === undefined ? '' : nilai).trim();
  if (!target) {
    return null;
  }
  for (var i = 0; i < daftar.length; i++) {
    if (String(daftar[i][kolom]).trim() === target) {
      return daftar[i];
    }
  }
  return null;
}

/* ======================== PENCATATAN PERUBAHAN DATA ======================== */

/* Tabel yang perubahannya dicatat otomatis di RIWAYAT_PERUBAHAN. */
var TABEL_DIAUDIT_ = { SANTRI: true, KELOMPOK: true, PENGGUNA: true };

/* Kolom yang isinya TIDAK PERNAH ditulis ke riwayat. */
var KOLOM_RAHASIA_ = { PASSWORD_HASH: true };

function teksSel_(nilai) {
  if (nilai instanceof Date && !isNaN(nilai.getTime())) {
    return Utilities.formatDate(nilai, APP_CONFIG.ZONA_WAKTU, 'yyyy-MM-dd');
  }
  return String(nilai === null || nilai === undefined ? '' : nilai).trim();
}

function kutipAudit_(nilai) {
  var t = teksSel_(nilai);
  if (t.length > 80) { t = t.substring(0, 77) + '...'; }
  return "'" + t + "'";
}

/**
 * Pelaku perubahan: pengguna yang sedang login (diisi oleh wajibLogin_),
 * atau SISTEM bila dijalankan dari editor Apps Script.
 */
function aktorAudit_() {
  var k = (typeof KONTEKS_PENGGUNA_ !== 'undefined') ? KONTEKS_PENGGUNA_ : null;
  if (k && k.idPengguna) {
    return { id: k.idPengguna, nama: k.nama };
  }
  return { id: 'SISTEM', nama: 'Sistem (dijalankan dari editor)' };
}

function catatPerubahanData_(namaSheet, idData, aksi, detail) {
  try {
    var aktor = aktorAudit_();
    var waktu = Utilities.formatDate(new Date(), APP_CONFIG.ZONA_WAKTU, 'yyyy-MM-dd HH:mm:ss');
    tambahBaris_('RIWAYAT_PERUBAHAN', {
      ID_LOG: buatId_('LOG'),
      WAKTU: waktu,
      ID_PENGGUNA: aktor.id,
      NAMA_PENGGUNA: aktor.nama,
      TABEL: namaSheet,
      ID_DATA: idData,
      AKSI: aksi,
      DETAIL: String(detail).substring(0, 1500)
    }, true);
  } catch (err) {
    console.error('Gagal mencatat perubahan data: ' + (err && err.message ? err.message : err));
  }
}

/**
 * Dipanggil oleh tambahBaris_ setiap ada baris baru. Hanya tabel yang diaudit yang dicatat.
 */
function auditPenambahan_(namaSheet, objek) {
  if (!TABEL_DIAUDIT_[namaSheet]) { return; }
  try {
    var header = SKEMA_DATABASE[namaSheet];
    var idData = teksSel_(objek[header[0]]);
    var bagian = [];
    header.forEach(function (kolom, i) {
      if (i === 0 || KOLOM_RAHASIA_[kolom]) { return; }
      var nilai = teksSel_(objek[kolom]);
      if (nilai !== '') { bagian.push(kolom + ': ' + kutipAudit_(nilai)); }
    });
    catatPerubahanData_(namaSheet, idData, 'TAMBAH', bagian.join('; '));
  } catch (err) {
    console.error('Gagal menyusun catatan penambahan: ' + (err && err.message ? err.message : err));
  }
}

/**
 * Dipanggil oleh perbaruiBaris_ setiap ada perubahan baris.
 * 1) Mencatat nilai lama dan baru kolom yang benar-benar berubah.
 * 2) Memutus semua sesi pengguna bila password, status aktif, atau role berubah.
 */
function auditPembaruan_(namaSheet, header, asli, perubahan) {
  if (!TABEL_DIAUDIT_[namaSheet]) { return; }

  var berubah = [];
  Object.keys(perubahan).forEach(function (kolom) {
    var i = header.indexOf(kolom);
    if (teksSel_(asli[i]) !== teksSel_(perubahan[kolom])) { berubah.push(kolom); }
  });
  if (!berubah.length) { return; }

  var idData = teksSel_(asli[0]);

  if (namaSheet === 'PENGGUNA' &&
      (berubah.indexOf('PASSWORD_HASH') >= 0 || berubah.indexOf('STATUS_AKTIF') >= 0 || berubah.indexOf('ROLE') >= 0)) {
    try {
      cabutSemuaSesiPengguna_(idData);
    } catch (err) {
      console.error('Gagal memutus sesi pengguna: ' + (err && err.message ? err.message : err));
    }
  }

  try {
    var aksi = 'UBAH';
    if (berubah.indexOf('PASSWORD_HASH') >= 0) {
      aksi = 'RESET_PASSWORD';
    } else if (berubah.indexOf('STATUS_AKTIF') >= 0) {
      aksi = String(perubahan.STATUS_AKTIF).trim().toUpperCase() === STATUS_AKTIF ? 'AKTIFKAN' : 'NONAKTIFKAN';
    }

    var kolomNama = { SANTRI: 'NAMA_SANTRI', KELOMPOK: 'NAMA_KELOMPOK', PENGGUNA: 'USERNAME' }[namaSheet];
    var label = '[' + teksSel_(asli[header.indexOf(kolomNama)]) + '] ';
    var detail = berubah.map(function (kolom) {
      if (KOLOM_RAHASIA_[kolom]) { return kolom + ': diganti'; }
      return kolom + ': ' + kutipAudit_(asli[header.indexOf(kolom)]) + ' -> ' + kutipAudit_(perubahan[kolom]);
    }).join('; ');

    catatPerubahanData_(namaSheet, idData, aksi, label + detail);
  } catch (err) {
    console.error('Gagal menyusun catatan perubahan: ' + (err && err.message ? err.message : err));
  }
}

/**
 * Mengubah beberapa kolom pada satu baris, lalu MEMBACA ULANG untuk memastikan tersimpan.
 * paksaTeks = true: seluruh baris disimpan sebagai teks.
 * Perubahan pada SANTRI, KELOMPOK, dan PENGGUNA otomatis dicatat.
 */
function perbaruiBaris_(namaSheet, nomorBaris, perubahan, paksaTeks) {
  var header = SKEMA_DATABASE[namaSheet];
  var sheet = ambilSheet_(namaSheet);
  var rentang = sheet.getRange(nomorBaris, 1, 1, header.length);

  var asli = rentang.getValues()[0];
  var nilai = asli.map(function (v) {
    if (!paksaTeks) { return v; }
    if (v instanceof Date) { return Utilities.formatDate(v, APP_CONFIG.ZONA_WAKTU, 'yyyy-MM-dd'); }
    return String(v);
  });

  var kolomDiubah = Object.keys(perubahan);
  kolomDiubah.forEach(function (kolom) {
    var i = header.indexOf(kolom);
    if (i < 0) {
      throw new Error('Kolom tidak dikenal: ' + kolom);
    }
    nilai[i] = paksaTeks ? String(perubahan[kolom]) : perubahan[kolom];
  });

  if (paksaTeks) {
    rentang.setNumberFormat('@');
  }
  rentang.setValues([nilai]);
  SpreadsheetApp.flush();

  var baca = sheet.getRange(nomorBaris, 1, 1, header.length).getValues()[0];
  kolomDiubah.forEach(function (kolom) {
    var i = header.indexOf(kolom);
    if (String(baca[i]) !== String(perubahan[kolom])) {
      throw new Error('Perubahan kolom ' + kolom + ' pada sheet ' + namaSheet + ' tidak tersimpan.');
    }
  });

  auditPembaruan_(namaSheet, header, asli, perubahan);
}

/**
 * Memastikan baris yang baru ditambahkan benar-benar ada di sheet.
 */
function pastikanBarisTersimpan_(namaSheet, posisi, kolom, nilai) {
  var header = SKEMA_DATABASE[namaSheet];
  var sel = ambilSheet_(namaSheet).getRange(posisi, header.indexOf(kolom) + 1).getValue();
  if (String(sel).trim() !== String(nilai).trim()) {
    throw new Error('Data tidak tersimpan pada sheet ' + namaSheet + '.');
  }
}

/**
 * UJI OTOMATIS: membuktikan bahwa akun Petugas DITOLAK server untuk semua fungsi Admin
 * dan hanya menerima data kelompoknya sendiri.
 * Dijalankan manual dari editor. Butuh akun Petugas dengan username petugas_uji
 * yang sudah memiliki kelompok. Tidak mengubah data apa pun.
 */
function ujiHakAksesTahap5() {
  pastikanDijalankanPemilik_();

  var petugas = cariPenggunaByUsername_('petugas_uji');
  if (!petugas || String(petugas.ROLE).trim().toUpperCase() !== ROLE_PETUGAS) {
    throw new Error('Akun petugas dengan username petugas_uji belum ada. Buat dulu lewat menu Data Petugas.');
  }
  var idKelompok = String(petugas.ID_KELOMPOK).trim();
  if (!idKelompok) {
    throw new Error('Akun petugas_uji belum memiliki kelompok. Tetapkan kelompoknya dulu.');
  }

  var token = buatSesi_(String(petugas.ID_PENGGUNA).trim());
  var hasil = [];

  function periksa(nama, respons, kodeDiharapkan) {
    var lulus = respons && respons.berhasil === false && respons.kode === kodeDiharapkan;
    var keterangan = !respons ? 'tidak ada respons' : (respons.berhasil ? 'DITERIMA (seharusnya ditolak)' : respons.kode);
    hasil.push((lulus ? 'LULUS' : 'GAGAL') + ' - ' + nama + ' -> ' + keterangan);
  }

  try {
    periksa('ambilDataKelompok', ambilDataKelompok(token), 'DILARANG');
    periksa('simpanKelompok', simpanKelompok(token, { nama: 'Uji' }), 'DILARANG');
    periksa('ubahStatusKelompok', ubahStatusKelompok(token, 'x', false), 'DILARANG');
    periksa('ambilDataPetugas', ambilDataPetugas(token), 'DILARANG');
    periksa('simpanPetugas', simpanPetugas(token, {}), 'DILARANG');
    periksa('resetPasswordPetugas', resetPasswordPetugas(token, 'x', 'abcdefgh12'), 'DILARANG');
    periksa('ubahStatusPetugas', ubahStatusPetugas(token, 'x', false), 'DILARANG');
    periksa('simpanSantri', simpanSantri(token, {}), 'DILARANG');
    periksa('ubahStatusSantri', ubahStatusSantri(token, 'x', false), 'DILARANG');
    periksa('ambilDataKelompok dengan token palsu', ambilDataKelompok('abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH'), 'SESI_HABIS');

    var daftar = ambilDaftarSantri(token);
    var jumlah = daftar.berhasil ? daftar.data.santri.length : 0;
    var bocor = daftar.berhasil && daftar.data.santri.some(function (s) { return s.idKelompok !== idKelompok; });
    hasil.push((daftar.berhasil && !bocor ? 'LULUS' : 'GAGAL') +
      ' - ambilDaftarSantri hanya berisi santri kelompok sendiri (' + jumlah + ' santri)');
  } finally {
    CacheService.getScriptCache().remove(kunciSesi_(token));
  }

  hasil.forEach(function (baris) { Logger.log(baris); });
  var gagal = hasil.filter(function (b) { return b.indexOf('GAGAL') === 0; }).length;
  Logger.log(gagal === 0 ? 'HASIL: SEMUA PENGUJIAN LULUS.' : 'HASIL: ' + gagal + ' PENGUJIAN GAGAL. Kirim log ini kepada saya.');
}