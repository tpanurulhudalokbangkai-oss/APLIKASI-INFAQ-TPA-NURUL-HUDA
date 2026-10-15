/**
 * Database.gs
 * Struktur database, fungsi inisialisasi, dan fungsi baca/tulis dasar.
 */

var ROLE_ADMIN = 'ADMIN';
var ROLE_PETUGAS = 'PETUGAS';
var STATUS_AKTIF = 'AKTIF';
var STATUS_NONAKTIF = 'NONAKTIF';

var SKEMA_DATABASE = {
  PENGGUNA: ['ID_PENGGUNA', 'NAMA', 'USERNAME', 'PASSWORD_HASH', 'ROLE', 'ID_KELOMPOK', 'STATUS_AKTIF'],
  SANTRI: ['ID_SANTRI', 'NIS', 'NAMA_SANTRI', 'ID_KELOMPOK', 'NAMA_ORANG_TUA', 'NOMOR_WA', 'TANGGAL_MASUK', 'STATUS_AKTIF', 'TANGGAL_NONAKTIF'],
  KELOMPOK: ['ID_KELOMPOK', 'NAMA_KELOMPOK', 'ID_PETUGAS', 'STATUS_AKTIF'],
  PEMBAYARAN: ['ID_PEMBAYARAN', 'TANGGAL_BAYAR', 'ID_SANTRI', 'NAMA_SANTRI', 'ID_KELOMPOK', 'BULAN', 'TAHUN', 'NOMINAL', 'PENERIMA', 'ID_PETUGAS_INPUT', 'CATATAN', 'STATUS_TRANSAKSI'],
  PENGATURAN: ['KUNCI', 'NILAI', 'KETERANGAN'],
  RIWAYAT_PERUBAHAN: ['ID_LOG', 'WAKTU', 'ID_PENGGUNA', 'NAMA_PENGGUNA', 'TABEL', 'ID_DATA', 'AKSI', 'DETAIL'],
  PEMBEBASAN: ['ID_PEMBEBASAN', 'ID_SANTRI', 'DARI', 'SAMPAI', 'ALASAN', 'STATUS_AKTIF']
};

/**
 * Mengambil spreadsheet tempat proyek ini menempel.
 */
function ambilSpreadsheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('Spreadsheet tidak ditemukan. Pastikan proyek dibuka dari menu Ekstensi > Apps Script pada spreadsheet database.');
  }
  return ss;
}

/**
 * Mengambil satu sheet berdasarkan nama.
 */
function ambilSheet_(namaSheet) {
  var sheet = ambilSpreadsheet_().getSheetByName(namaSheet);
  if (!sheet) {
    throw new Error('Sheet ' + namaSheet + ' tidak ditemukan. Jalankan initDatabase terlebih dahulu.');
  }
  return sheet;
}

/**
 * Membaca seluruh isi sheet menjadi daftar objek.
 * Setiap objek berisi nama kolom sebagai kunci, ditambah _baris (nomor baris di sheet).
 */
function bacaTabel_(namaSheet) {
  var header = SKEMA_DATABASE[namaSheet];
  var sheet = ambilSheet_(namaSheet);
  var barisTerakhir = sheet.getLastRow();
  if (barisTerakhir < 2) {
    return [];
  }
  var nilai = sheet.getRange(2, 1, barisTerakhir - 1, header.length).getValues();
  return nilai.map(function (baris, i) {
    var obj = { _baris: i + 2 };
    header.forEach(function (nama, k) { obj[nama] = baris[k]; });
    return obj;
  });
}

/**
 * Menambah satu baris di bagian bawah sheet.
 * paksaTeks = true: semua sel baris itu disimpan sebagai teks (mencegah "00123" berubah menjadi angka).
 * Penambahan pada SANTRI, KELOMPOK, dan PENGGUNA otomatis dicatat di RIWAYAT_PERUBAHAN.
 * Pemanggil sebaiknya memakai LockService.
 */
function tambahBaris_(namaSheet, objek, paksaTeks) {
  var header = SKEMA_DATABASE[namaSheet];
  var sheet = ambilSheet_(namaSheet);
  var baris = header.map(function (nama) {
    return objek[nama] === undefined ? '' : objek[nama];
  });
  var posisi = sheet.getLastRow() + 1;
  var rentang = sheet.getRange(posisi, 1, 1, header.length);
  if (paksaTeks) {
    rentang.setNumberFormat('@');
  }
  rentang.setValues([baris]);
  SpreadsheetApp.flush();

  auditPenambahan_(namaSheet, objek);
  return posisi;
}

/**
 * Membuat ID unik, contoh: USR-3F9A1C2B
 */
function buatId_(prefix) {
  return prefix + '-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8).toUpperCase();
}

/**
 * Membuat sheet dan header yang belum ada, dan menambahkan kolom baru di belakang header lama.
 * AMAN dijalankan berulang kali: tidak menghapus dan tidak menimpa data.
 * Hanya boleh dijalankan pemilik dari editor Apps Script.
 */
function initDatabase() {
  pastikanDijalankanPemilik_();

  var ss = ambilSpreadsheet_();
  var laporan = [];

  Object.keys(SKEMA_DATABASE).forEach(function (namaSheet) {
    var header = SKEMA_DATABASE[namaSheet];
    var sheet = ss.getSheetByName(namaSheet);
    var status = '';

    if (!sheet) {
      sheet = ss.insertSheet(namaSheet);
      status = 'Sheet dibuat';
    }

    if (sheet.getMaxColumns() < header.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), header.length - sheet.getMaxColumns());
    }

    var barisPertama = sheet.getRange(1, 1, 1, header.length).getValues()[0]
      .map(function (v) { return String(v).trim(); });
    var kosong = barisPertama.every(function (v) { return v === ''; });
    var sama = barisPertama.every(function (v, i) { return v === header[i]; });

    if (kosong) {
      sheet.getRange(1, 1, 1, header.length).setValues([header]);
      status = status ? status + ', header ditulis' : 'Header ditulis';
      formatHeader_(sheet, header.length);
    } else if (sama) {
      status = status || 'Sudah benar, tidak diubah';
    } else {
      // Perluasan: kolom awal cocok dan kolom tambahan di belakang masih kosong
      var cocok = 0;
      while (cocok < header.length && barisPertama[cocok] === header[cocok]) { cocok++; }
      var sisaKosong = barisPertama.slice(cocok).every(function (v) { return v === ''; });
      if (cocok > 0 && sisaKosong) {
        sheet.getRange(1, cocok + 1, 1, header.length - cocok).setValues([header.slice(cocok)]);
        formatHeader_(sheet, header.length);
        status = 'Header diperluas: kolom ' + header.slice(cocok).join(', ') + ' ditambahkan';
      } else {
        status = 'PERHATIAN: header tidak sesuai, tidak diubah. Periksa baris 1 sheet ' + namaSheet;
      }
    }

    // Kolom ID_SANTRI, DARI, SAMPAI pada PEMBEBASAN disimpan sebagai teks
    // supaya "2026-04" tidak berubah menjadi tanggal saat diketik.
    if (namaSheet === 'PEMBEBASAN') {
      sheet.getRange(2, 2, Math.max(1, sheet.getMaxRows() - 1), 3).setNumberFormat('@');
    }

    laporan.push(namaSheet + ': ' + status);
  });

  laporan.forEach(function (baris) { Logger.log(baris); });
  return laporan;
}

/**
 * Memberi warna hijau tua pada header dan membekukan baris 1.
 */
function formatHeader_(sheet, jumlahKolom) {
  sheet.getRange(1, 1, 1, jumlahKolom)
    .setFontWeight('bold')
    .setFontColor('#FFFFFF')
    .setBackground('#0B4D3A');
  sheet.setFrozenRows(1);
}

/**
 * Hanya MEMERIKSA (tidak mengubah apa pun) apakah setiap sheet dan header sudah benar.
 */
function cekStrukturDatabase_() {
  var ss = ambilSpreadsheet_();
  return Object.keys(SKEMA_DATABASE).map(function (namaSheet) {
    var header = SKEMA_DATABASE[namaSheet];
    var sheet = ss.getSheetByName(namaSheet);
    if (!sheet) {
      return { nama: namaSheet, ada: false, headerBenar: false };
    }
    if (sheet.getMaxColumns() < header.length) {
      return { nama: namaSheet, ada: true, headerBenar: false };
    }
    var barisPertama = sheet.getRange(1, 1, 1, header.length).getValues()[0]
      .map(function (v) { return String(v).trim(); });
    var sama = barisPertama.every(function (v, i) { return v === header[i]; });
    return { nama: namaSheet, ada: true, headerBenar: sama };
  });
}