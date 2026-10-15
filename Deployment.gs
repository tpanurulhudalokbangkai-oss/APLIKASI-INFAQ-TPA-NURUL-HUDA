/**
 * Deployment.gs
 * Alat untuk rilis dan perawatan. SEMUA fungsi di sini hanya bisa dijalankan
 * oleh pemilik dari editor Apps Script (atau oleh pemicu waktu milik pemilik).
 *
 *   periksaKesiapanDeployment()  memeriksa kesiapan rilis (hanya membaca)
 *   buatAdminTambahan()          membuat akun Admin cadangan (lewat Properti Skrip)
 *   gantiPasswordPengguna()      mengganti password pengguna mana pun, termasuk Admin
 *   cadangkanDatabase()          membuat salinan spreadsheet ke folder cadangan
 *   pasangPencadanganOtomatis()  memasang cadangan otomatis tiap hari Minggu
 *   hapusPencadanganOtomatis()   mencabut cadangan otomatis
 *   ujiPemicuCadangan()          menguji bahwa pemicu waktu dapat menjalankan cadangan
 */

var NAMA_FOLDER_CADANGAN = 'Cadangan Infaq TPA Nurul Huda';
var JUMLAH_CADANGAN_DISIMPAN = 8;

/* ======================== PEMBANTU ======================== */

function ambilFolderCadangan_() {
  var it = DriveApp.getFoldersByName(NAMA_FOLDER_CADANGAN);
  return it.hasNext() ? it.next() : DriveApp.createFolder(NAMA_FOLDER_CADANGAN);
}

function hapusPemicuCadangan_() {
  var jumlah = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'cadangkanDatabase') {
      ScriptApp.deleteTrigger(t);
      jumlah++;
    }
  });
  return jumlah;
}

/* ======================== PEMERIKSA KESIAPAN ======================== */

/**
 * Memeriksa apakah aplikasi siap dirilis. HANYA MEMBACA, tidak mengubah data.
 * LULUS = aman. PERINGATAN = sebaiknya diperbaiki. GAGAL = harus diperbaiki sebelum rilis.
 */
function periksaKesiapanDeployment() {
  pastikanDijalankanPemilik_();

  var hasil = [];
  function lapor(tingkat, nama, rincian) {
    hasil.push(tingkat + ' - ' + nama + (rincian ? ' [' + rincian + ']' : ''));
  }
  function teks(v) { return String(v === null || v === undefined ? '' : v).trim(); }

  var ss = ambilSpreadsheet_();
  var pemilik = Session.getEffectiveUser().getEmail();
  Logger.log('Akun pemilik (akun yang menjalankan aplikasi): ' + pemilik);

  // 1. Zona waktu
  var zonaSkrip = Session.getScriptTimeZone();
  lapor(zonaSkrip === APP_CONFIG.ZONA_WAKTU ? 'LULUS' : 'PERINGATAN', 'zona waktu proyek Apps Script',
    'proyek: ' + zonaSkrip + ', aplikasi: ' + APP_CONFIG.ZONA_WAKTU + (zonaSkrip === APP_CONFIG.ZONA_WAKTU ? '' : ' -> ubah timeZone di appsscript.json'));
  var zonaSheet = ss.getSpreadsheetTimeZone();
  lapor(zonaSheet === APP_CONFIG.ZONA_WAKTU ? 'LULUS' : 'PERINGATAN', 'zona waktu spreadsheet',
    'spreadsheet: ' + zonaSheet + (zonaSheet === APP_CONFIG.ZONA_WAKTU ? '' : ' -> File > Setelan > Zona waktu'));

  // 2. Properti Skrip yang berisi password
  var props = PropertiesService.getScriptProperties();
  var kunciBahaya = ['ADMIN_NAMA', 'ADMIN_USERNAME', 'ADMIN_PASSWORD', 'ADMIN2_NAMA', 'ADMIN2_USERNAME', 'ADMIN2_PASSWORD',
    'PETUGAS_UJI_PASSWORD', 'RESET_USERNAME', 'RESET_PASSWORD_BARU'];
  var tersisa = kunciBahaya.filter(function (k) { return props.getProperty(k) !== null; });
  lapor(tersisa.length === 0 ? 'LULUS' : 'GAGAL', 'tidak ada password tersisa di Properti Skrip',
    tersisa.length ? 'hapus: ' + tersisa.join(', ') : '');

  // 3. Akun
  var pengguna = bacaTabel_('PENGGUNA').filter(function (p) { return teks(p.ID_PENGGUNA); });
  var adminAktif = pengguna.filter(function (p) {
    return teks(p.ROLE).toUpperCase() === ROLE_ADMIN && adalahAktif_(p.STATUS_AKTIF);
  });
  lapor(adminAktif.length >= 1 ? 'LULUS' : 'GAGAL', 'ada akun Admin aktif', adminAktif.length + ' akun');
  if (adminAktif.length === 1) {
    lapor('PERINGATAN', 'hanya ada satu Admin aktif', 'buat Admin cadangan dengan buatAdminTambahan()');
  }
  var akunUji = pengguna.filter(function (p) {
    return /^(petugas_uji|uji_)/i.test(teks(p.USERNAME)) || /(^|\s)uji(\s|\)|$)/i.test(teks(p.NAMA));
  });
  lapor(akunUji.length === 0 ? 'LULUS' : 'GAGAL', 'tidak ada akun uji',
    akunUji.length ? 'nonaktifkan atau hapus: ' + akunUji.map(function (p) { return teks(p.USERNAME); }).join(', ') : '');

  // 4. Data uji
  var namaUji = [];
  bacaTabel_('SANTRI').forEach(function (s) {
    if (/(^|\s)uji(\s|\)|$)/i.test(teks(s.NAMA_SANTRI))) { namaUji.push('santri ' + teks(s.NAMA_SANTRI)); }
  });
  bacaTabel_('KELOMPOK').forEach(function (k) {
    if (/(^|\s)uji(\s|\)|$)/i.test(teks(k.NAMA_KELOMPOK))) { namaUji.push('kelompok ' + teks(k.NAMA_KELOMPOK)); }
  });
  lapor(namaUji.length === 0 ? 'LULUS' : 'PERINGATAN', 'tidak ada data bernama "Uji"',
    namaUji.length ? namaUji.slice(0, 5).join('; ') + (namaUji.length > 5 ? '; ...' : '') : '');

  // 5. Nominal infaq
  lapor(bacaRiwayatNominal_().length > 0 ? 'LULUS' : 'PERINGATAN', 'nominal infaq sudah diatur', 'menu Pengaturan');

  // 6. Pembagian spreadsheet
  try {
    var file = DriveApp.getFileById(ss.getId());
    var akses = String(file.getSharingAccess());
    lapor(akses === String(DriveApp.Access.PRIVATE) ? 'LULUS' : 'GAGAL', 'spreadsheet tidak terbuka lewat tautan', 'akses: ' + akses);

    var editor = file.getEditors().map(function (u) { return u.getEmail(); }).filter(function (e) { return e && e !== pemilik; });
    var pembaca = file.getViewers().map(function (u) { return u.getEmail(); }).filter(function (e) { return e && e !== pemilik; });
    var dibagikan = editor.concat(pembaca);
    lapor(dibagikan.length === 0 ? 'LULUS' : 'GAGAL', 'spreadsheet tidak dibagikan kepada orang lain',
      dibagikan.length ? 'dibagikan kepada: ' + dibagikan.join(', ') + ' -> cabut lewat tombol Bagikan' : '');
  } catch (err) {
    lapor('PERINGATAN', 'pembagian spreadsheet tidak dapat diperiksa otomatis', 'periksa manual lewat tombol Bagikan: ' + (err && err.message ? err.message : err));
  }

  // 7. Kesehatan data (memakai periksaIntegritasData)
  var awalLog = Logger.getLog().length;
  periksaIntegritasData();
  var potongan = Logger.getLog().substring(awalLog);
  var m = potongan.match(/(\d+) temuan KRITIS, (\d+) PERINGATAN/);
  if (m) {
    lapor(Number(m[1]) === 0 ? 'LULUS' : 'GAGAL', 'kesehatan data (periksaIntegritasData)', m[1] + ' KRITIS, ' + m[2] + ' peringatan');
  } else {
    lapor('PERINGATAN', 'kesehatan data tidak dapat dibaca otomatis', 'jalankan periksaIntegritasData() secara terpisah');
  }

  // 8. Cadangan
  var adaPemicu = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'cadangkanDatabase'; });
  lapor(adaPemicu ? 'LULUS' : 'PERINGATAN', 'cadangan otomatis terpasang', adaPemicu ? '' : 'jalankan pasangPencadanganOtomatis()');

  var terbaru = 0;
  var folder = DriveApp.getFoldersByName(NAMA_FOLDER_CADANGAN);
  if (folder.hasNext()) {
    var berkas = folder.next().getFiles();
    while (berkas.hasNext()) {
      var f = berkas.next();
      if (f.getName().indexOf('CADANGAN_') === 0 && f.getDateCreated().getTime() > terbaru) { terbaru = f.getDateCreated().getTime(); }
    }
  }
  var umurHari = terbaru ? Math.floor((Date.now() - terbaru) / 86400000) : -1;
  lapor(terbaru && umurHari <= 10 ? 'LULUS' : 'PERINGATAN', 'ada cadangan yang masih baru (maksimal 10 hari)',
    terbaru ? 'cadangan terakhir ' + umurHari + ' hari lalu' : 'belum ada cadangan -> jalankan cadangkanDatabase()');

  hasil.forEach(function (b) { Logger.log(b); });
  var gagal = hasil.filter(function (b) { return b.indexOf('GAGAL') === 0; }).length;
  var peringatan = hasil.filter(function (b) { return b.indexOf('PERINGATAN') === 0; }).length;
  Logger.log(gagal === 0
    ? 'HASIL: SIAP DEPLOYMENT (' + peringatan + ' peringatan).'
    : 'HASIL: BELUM SIAP, ' + gagal + ' hal harus diperbaiki dulu.');
}

/* ======================== AKUN ADMIN ======================== */

/**
 * Membuat akun Admin tambahan (Admin cadangan).
 * Isi dulu Properti Skrip: ADMIN2_NAMA, ADMIN2_USERNAME, ADMIN2_PASSWORD.
 * Properti itu SELALU dihapus setelah fungsi berjalan, berhasil atau gagal.
 */
function buatAdminTambahan() {
  pastikanDijalankanPemilik_();

  var props = PropertiesService.getScriptProperties();
  var nama = props.getProperty('ADMIN2_NAMA');
  var username = props.getProperty('ADMIN2_USERNAME');
  var password = props.getProperty('ADMIN2_PASSWORD');

  try {
    if (!nama || !username || !password) {
      throw new Error('Properti Skrip ADMIN2_NAMA, ADMIN2_USERNAME, dan ADMIN2_PASSWORD belum diisi lengkap.');
    }
    buatPengguna_({ nama: nama, username: username, password: password, role: ROLE_ADMIN, idKelompok: '' });
    Logger.log('Admin tambahan berhasil dibuat dengan username: ' + String(username).trim().toLowerCase());
  } finally {
    props.deleteProperty('ADMIN2_NAMA');
    props.deleteProperty('ADMIN2_USERNAME');
    props.deleteProperty('ADMIN2_PASSWORD');
    Logger.log('Properti sementara ADMIN2_... sudah dihapus. Jika pembuatan gagal, isi ulang lalu jalankan lagi.');
  }
}

/**
 * Mengganti password pengguna mana pun (Admin atau Petugas), misalnya Admin yang lupa password.
 * Isi dulu Properti Skrip: RESET_USERNAME dan RESET_PASSWORD_BARU.
 * Semua sesi lama pengguna itu diputus, kunci percobaan login dibuka, dan perubahan dicatat
 * di RIWAYAT_PERUBAHAN (tanpa password). Properti SELALU dihapus setelah fungsi berjalan.
 */
function gantiPasswordPengguna() {
  pastikanDijalankanPemilik_();

  var props = PropertiesService.getScriptProperties();
  var username = props.getProperty('RESET_USERNAME');
  var passwordBaru = props.getProperty('RESET_PASSWORD_BARU');

  try {
    if (!username || !passwordBaru) {
      throw new Error('Properti Skrip RESET_USERNAME dan RESET_PASSWORD_BARU belum diisi lengkap.');
    }
    var nama = String(username).trim().toLowerCase();
    var u = cariPenggunaByUsername_(nama);
    if (!u) {
      throw new Error('Username "' + nama + '" tidak ditemukan.');
    }
    validasiPassword_(String(passwordBaru), String(u.USERNAME));
    var hash = buatHashPassword_(String(passwordBaru));

    dalamKunci_(function () {
      var baris = cariBaris_(bacaTabel_('PENGGUNA'), 'ID_PENGGUNA', u.ID_PENGGUNA);
      perbaruiBaris_('PENGGUNA', baris._baris, { PASSWORD_HASH: hash }, true);
    });
    hapusGagal_(nama);

    Logger.log('Password pengguna "' + nama + '" berhasil diganti. Sesi lama pengguna itu sudah diputus.');
  } finally {
    props.deleteProperty('RESET_USERNAME');
    props.deleteProperty('RESET_PASSWORD_BARU');
    Logger.log('Properti sementara RESET_... sudah dihapus. Jika penggantian gagal, isi ulang lalu jalankan lagi.');
  }
}

/* ======================== CADANGAN ======================== */

/**
 * Membuat salinan spreadsheet database ke folder "Cadangan Infaq TPA Nurul Huda" di Google Drive
 * pemilik, dan menyimpan hanya 8 salinan terbaru (yang lebih lama dibuang ke Sampah).
 * Salinan memuat kode aplikasi juga (skrip ikut tersalin), jadi sekaligus menjadi cadangan kode.
 * Salinan berisi data pribadi: jangan dibagikan.
 */
function cadangkanDatabase() {
  pastikanDijalankanPemilik_();

  var ss = ambilSpreadsheet_();
  var folder = ambilFolderCadangan_();
  var stempel = Utilities.formatDate(new Date(), APP_CONFIG.ZONA_WAKTU, 'yyyyMMdd-HHmm');
  var salinan = DriveApp.getFileById(ss.getId()).makeCopy('CADANGAN_' + stempel + '_' + ss.getName(), folder);

  var semua = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().indexOf('CADANGAN_') === 0) {
      semua.push({ file: f, waktu: f.getDateCreated().getTime() });
    }
  }
  semua.sort(function (a, b) { return b.waktu - a.waktu; });

  var dibuang = 0;
  for (var i = JUMLAH_CADANGAN_DISIMPAN; i < semua.length; i++) {
    semua[i].file.setTrashed(true);
    dibuang++;
  }

  Logger.log('Cadangan dibuat: ' + salinan.getName());
  Logger.log('Cadangan tersimpan: ' + Math.min(semua.length, JUMLAH_CADANGAN_DISIMPAN) + ', cadangan lama dibuang: ' + dibuang);
}

/**
 * Memasang cadangan otomatis setiap hari Minggu sekitar pukul 02.00 (zona waktu proyek).
 */
function pasangPencadanganOtomatis() {
  pastikanDijalankanPemilik_();

  hapusPemicuCadangan_();
  ScriptApp.newTrigger('cadangkanDatabase')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(2)
    .create();
  Logger.log('Cadangan otomatis dipasang: setiap hari Minggu sekitar pukul 02.00 (' + Session.getScriptTimeZone() + ').');
  Logger.log('Disarankan menjalankan ujiPemicuCadangan() untuk memastikan pemicu berjalan.');
}

function hapusPencadanganOtomatis() {
  pastikanDijalankanPemilik_();

  var n = hapusPemicuCadangan_();
  Logger.log('Pemicu cadangan otomatis yang dicabut: ' + n);
}

/**
 * Menguji pemicu waktu: membuat pemicu sekali jalan (sekitar 1 menit lagi) yang menjalankan
 * cadangkanDatabase. Setelah 2 menit, periksa halaman Eksekusi dan folder cadangan di Drive.
 */
function ujiPemicuCadangan() {
  pastikanDijalankanPemilik_();

  ScriptApp.newTrigger('cadangkanDatabase')
    .timeBased()
    .after(60 * 1000)
    .create();
  Logger.log('Pemicu uji dibuat. Tunggu sekitar 2 menit, lalu buka menu Eksekusi di Apps Script:');
  Logger.log('eksekusi cadangkanDatabase harus berstatus Selesai, dan muncul berkas CADANGAN_ baru di folder "' + NAMA_FOLDER_CADANGAN + '".');
}