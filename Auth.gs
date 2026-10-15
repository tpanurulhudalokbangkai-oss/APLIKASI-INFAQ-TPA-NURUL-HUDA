/**
 * Auth.gs
 * Login, logout, sesi, hak akses, dan pembuatan akun.
 *
 * ATURAN PENTING:
 * - Fungsi TANPA garis bawah di akhir nama dapat dipanggil dari browser.
 *   Semua fungsi seperti itu WAJIB memeriksa sesi di server.
 * - Fungsi DENGAN garis bawah di akhir nama bersifat privat.
 * - Role dan kelompok pengguna SELALU dibaca ulang dari sheet PENGGUNA,
 *   tidak pernah dipercaya dari browser.
 */

/**
 * Pengguna yang sedang menjalankan permintaan ini (diisi oleh wajibLogin_).
 * Dipakai lapisan data untuk mencatat siapa yang mengubah data.
 * Kosong bila dijalankan dari editor Apps Script.
 */
var KONTEKS_PENGGUNA_ = null;

var AWALAN_SESI_MIN = 'SESI_MIN_';

/* ======================== GALAT (ERROR) ======================== */

function buatGalat_(kode, pesan) {
  var e = new Error(pesan);
  e.kode = kode;
  return e;
}

/**
 * Mengubah error menjadi respons aman untuk browser.
 * Detail teknis hanya dicatat di log server, tidak dikirim ke browser.
 */
function galatKeRespons_(err) {
  if (err && err.kode) {
    return { berhasil: false, kode: err.kode, pesan: err.message };
  }
  console.error(err && err.stack ? err.stack : err);
  return { berhasil: false, kode: 'GALAT_SERVER', pesan: 'Terjadi kesalahan pada server. Silakan coba lagi.' };
}

/* ======================== PASSWORD ======================== */

function teksKeBytes_(teks) {
  return Utilities.newBlob(String(teks)).getBytes();
}

function bytesKeHex_(bytes) {
  return bytes.map(function (b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

function sha256Hex_(teks) {
  return bytesKeHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(teks), Utilities.Charset.UTF_8));
}

/**
 * PBKDF2-HMAC-SHA256 (satu blok 32 byte). Hasil berupa teks heksadesimal.
 */
function pbkdf2_(password, salt, iterasi) {
  var kunci = teksKeBytes_(password);
  var pesan = teksKeBytes_(salt).concat([0, 0, 0, 1]);
  var u = Utilities.computeHmacSha256Signature(pesan, kunci);
  var t = u.slice();
  for (var i = 1; i < iterasi; i++) {
    u = Utilities.computeHmacSha256Signature(u, kunci);
    for (var j = 0; j < t.length; j++) {
      t[j] = t[j] ^ u[j];
    }
  }
  return bytesKeHex_(t);
}

/**
 * Hasil: v1$jumlahIterasi$salt$hash
 */
function buatHashPassword_(password) {
  var salt = Utilities.getUuid().replace(/-/g, '');
  var iterasi = APP_CONFIG.PBKDF2_ITERASI;
  return 'v1$' + iterasi + '$' + salt + '$' + pbkdf2_(password, salt, iterasi);
}

/**
 * Perbandingan teks dengan waktu yang tetap (tidak membocorkan posisi perbedaan).
 */
function samaAman_(a, b) {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) {
    return false;
  }
  var selisih = 0;
  for (var i = 0; i < a.length; i++) {
    selisih |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return selisih === 0;
}

function verifikasiPassword_(password, tersimpan) {
  var bagian = String(tersimpan || '').split('$');
  if (bagian.length !== 4 || bagian[0] !== 'v1') {
    return false;
  }
  var iterasi = parseInt(bagian[1], 10);
  if (!(iterasi >= 1 && iterasi <= 100000)) {
    return false;
  }
  return samaAman_(pbkdf2_(password, bagian[2], iterasi), bagian[3]);
}

/**
 * Hash palsu untuk username yang tidak ada, supaya waktu respons tetap sama
 * dan penyerang tidak bisa menebak username mana yang terdaftar.
 */
function hashPalsu_() {
  return 'v1$' + APP_CONFIG.PBKDF2_ITERASI + '$00000000000000000000000000000000$' + new Array(65).join('0');
}

function validasiPassword_(password, username) {
  if (password.length < 8) {
    throw buatGalat_('DATA_TIDAK_VALID', 'Password minimal 8 karakter.');
  }
  if (password.length > 100) {
    throw buatGalat_('DATA_TIDAK_VALID', 'Password maksimal 100 karakter.');
  }
  if (password.toLowerCase() === String(username).toLowerCase()) {
    throw buatGalat_('DATA_TIDAK_VALID', 'Password tidak boleh sama dengan username.');
  }
}

/* ======================== PEMBATASAN PERCOBAAN LOGIN ======================== */

function kunciGagal_(username) {
  return 'GAGAL_' + sha256Hex_(username).substring(0, 40);
}

function sedangDikunci_(username) {
  var jumlah = Number(CacheService.getScriptCache().get(kunciGagal_(username)) || 0);
  return jumlah >= APP_CONFIG.MAKS_GAGAL_LOGIN;
}

function catatGagal_(username) {
  var cache = CacheService.getScriptCache();
  var kunci = kunciGagal_(username);
  var jumlah = Number(cache.get(kunci) || 0) + 1;
  cache.put(kunci, String(jumlah), APP_CONFIG.DURASI_KUNCI_DETIK);
}

function hapusGagal_(username) {
  CacheService.getScriptCache().remove(kunciGagal_(username));
}

/* ======================== PENCARIAN PENGGUNA ======================== */

function adalahAktif_(nilai) {
  return String(nilai).trim().toUpperCase() === STATUS_AKTIF;
}

function cariPenggunaByUsername_(username) {
  var target = String(username).trim().toLowerCase();
  var daftar = bacaTabel_('PENGGUNA');
  for (var i = 0; i < daftar.length; i++) {
    if (String(daftar[i].USERNAME).trim().toLowerCase() === target) {
      return daftar[i];
    }
  }
  return null;
}

function cariPenggunaById_(idPengguna) {
  var target = String(idPengguna).trim();
  var daftar = bacaTabel_('PENGGUNA');
  for (var i = 0; i < daftar.length; i++) {
    if (String(daftar[i].ID_PENGGUNA).trim() === target) {
      return daftar[i];
    }
  }
  return null;
}

/**
 * Membentuk profil internal dari satu baris PENGGUNA dan memeriksa kelengkapannya.
 */
function bentukProfil_(baris) {
  var role = String(baris.ROLE).trim().toUpperCase();
  if (role !== ROLE_ADMIN && role !== ROLE_PETUGAS) {
    throw buatGalat_('DILARANG', 'Peran akun tidak dikenali. Hubungi Admin.');
  }
  var idKelompok = String(baris.ID_KELOMPOK === undefined ? '' : baris.ID_KELOMPOK).trim();
  if (role === ROLE_PETUGAS && !idKelompok) {
    throw buatGalat_('DILARANG', 'Akun petugas ini belum ditetapkan pada kelompok. Hubungi Admin.');
  }
  return {
    idPengguna: String(baris.ID_PENGGUNA).trim(),
    nama: String(baris.NAMA).trim(),
    username: String(baris.USERNAME).trim(),
    role: role,
    idKelompok: role === ROLE_ADMIN ? '' : idKelompok
  };
}

/**
 * Data yang boleh dikirim ke browser. Tidak ada ID internal dan tidak ada password.
 */
function profilPublik_(profil) {
  return {
    nama: profil.nama,
    username: profil.username,
    role: profil.role,
    idKelompok: profil.idKelompok
  };
}

/* ======================== SESI ======================== */

function formatTokenValid_(token) {
  return typeof token === 'string' && /^[A-Za-z0-9]{40,100}$/.test(token);
}

function kunciSesi_(token) {
  return 'SES_' + sha256Hex_(token);
}

function buatSesi_(idPengguna) {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var sesi = {
    idPengguna: String(idPengguna),
    kedaluwarsa: Date.now() + APP_CONFIG.SESI_DETIK * 1000
  };
  CacheService.getScriptCache().put(kunciSesi_(token), JSON.stringify(sesi), APP_CONFIG.SESI_DETIK);
  return token;
}

/**
 * Memutus SEMUA sesi login milik satu pengguna yang dibuat sebelum saat ini.
 * Dipanggil otomatis saat password diganti serta saat status aktif atau role berubah.
 * Penandanya disimpan di Properti Skrip (tahan lama), bukan di cache yang bisa hilang.
 */
function cabutSemuaSesiPengguna_(idPengguna) {
  var id = String(idPengguna || '').trim();
  if (!id) { return; }
  PropertiesService.getScriptProperties().setProperty(AWALAN_SESI_MIN + id, String(Date.now()));
}

function batasSesiPengguna_(idPengguna) {
  return Number(PropertiesService.getScriptProperties().getProperty(AWALAN_SESI_MIN + idPengguna) || 0);
}

/**
 * PENJAGA UTAMA. Dipanggil di awal setiap fungsi yang dilindungi.
 * Mengembalikan profil pengguna dari data server, atau melempar error.
 */
function wajibLogin_(token) {
  var pesanHabis = 'Sesi Anda tidak valid atau sudah berakhir. Silakan login kembali.';

  if (!formatTokenValid_(token)) {
    throw buatGalat_('SESI_HABIS', pesanHabis);
  }

  var cache = CacheService.getScriptCache();
  var kunci = kunciSesi_(token);
  var mentah = cache.get(kunci);
  if (!mentah) {
    throw buatGalat_('SESI_HABIS', pesanHabis);
  }

  var sesi;
  try {
    sesi = JSON.parse(mentah);
  } catch (e) {
    cache.remove(kunci);
    throw buatGalat_('SESI_HABIS', pesanHabis);
  }

  if (!sesi || !sesi.idPengguna || !sesi.kedaluwarsa || Date.now() > sesi.kedaluwarsa) {
    cache.remove(kunci);
    throw buatGalat_('SESI_HABIS', pesanHabis);
  }

  var baris = cariPenggunaById_(sesi.idPengguna);
  if (!baris || !adalahAktif_(baris.STATUS_AKTIF)) {
    cache.remove(kunci);
    throw buatGalat_('SESI_HABIS', pesanHabis);
  }

  // Sesi yang dibuat sebelum penanda pemutusan (reset password, akun dinonaktifkan) tidak berlaku
  var dibuat = sesi.kedaluwarsa - APP_CONFIG.SESI_DETIK * 1000;
  if (dibuat < batasSesiPengguna_(String(sesi.idPengguna).trim())) {
    cache.remove(kunci);
    throw buatGalat_('SESI_HABIS', pesanHabis);
  }

  var profil = bentukProfil_(baris);
  KONTEKS_PENGGUNA_ = profil;
  return profil;
}

function wajibAdmin_(profil) {
  if (!profil || profil.role !== ROLE_ADMIN) {
    throw buatGalat_('DILARANG', 'Anda tidak memiliki hak akses untuk fungsi ini.');
  }
}

/**
 * Admin boleh mengakses semua kelompok.
 * Petugas hanya boleh mengakses kelompok miliknya sendiri (dibandingkan dengan data server).
 */
function wajibAksesKelompok_(profil, idKelompok) {
  if (profil.role === ROLE_ADMIN) {
    return;
  }
  var diminta = String(idKelompok === undefined || idKelompok === null ? '' : idKelompok).trim();
  if (profil.role === ROLE_PETUGAS && profil.idKelompok && diminta === profil.idKelompok) {
    return;
  }
  throw buatGalat_('DILARANG', 'Anda tidak memiliki hak akses ke data kelompok tersebut.');
}

/* ======================== FUNGSI YANG DIPANGGIL DARI BROWSER ======================== */

function login(username, password) {
  try {
    username = String(username || '').trim().toLowerCase();
    password = String(password || '');

    if (!username || !password) {
      return { berhasil: false, kode: 'DATA_TIDAK_VALID', pesan: 'Username dan password wajib diisi.' };
    }
    if (username.length > 50 || password.length > 200) {
      return { berhasil: false, kode: 'LOGIN_GAGAL', pesan: 'Username atau password salah, atau akun tidak aktif.' };
    }
    if (sedangDikunci_(username)) {
      var menit = Math.round(APP_CONFIG.DURASI_KUNCI_DETIK / 60);
      return { berhasil: false, kode: 'DIKUNCI', pesan: 'Terlalu banyak percobaan gagal. Silakan coba lagi dalam ' + menit + ' menit.' };
    }

    var baris = cariPenggunaByUsername_(username);
    var cocok = verifikasiPassword_(password, baris ? baris.PASSWORD_HASH : hashPalsu_());

    if (!baris || !cocok || !adalahAktif_(baris.STATUS_AKTIF)) {
      catatGagal_(username);
      return { berhasil: false, kode: 'LOGIN_GAGAL', pesan: 'Username atau password salah, atau akun tidak aktif.' };
    }

    var profil = bentukProfil_(baris);
    hapusGagal_(username);
    var token = buatSesi_(profil.idPengguna);

    return { berhasil: true, token: token, pengguna: profilPublik_(profil) };
  } catch (err) {
    return galatKeRespons_(err);
  }
}

function logout(token) {
  try {
    if (formatTokenValid_(token)) {
      CacheService.getScriptCache().remove(kunciSesi_(token));
    }
  } catch (err) {
    console.error(err);
  }
  return { berhasil: true };
}

/**
 * Dipakai saat halaman dimuat ulang: memeriksa apakah token masih berlaku.
 */
function ambilSesi(token) {
  try {
    var profil = wajibLogin_(token);
    return { berhasil: true, pengguna: profilPublik_(profil) };
  } catch (err) {
    return galatKeRespons_(err);
  }
}

/* ======================== PEMBUATAN AKUN (HANYA DARI EDITOR) ======================== */

/**
 * Memastikan fungsi dijalankan oleh pemilik script dari editor Apps Script.
 * Pengunjung web app tidak akan lolos pemeriksaan ini.
 */
function pastikanDijalankanPemilik_() {
  var aktif = Session.getActiveUser().getEmail();
  var pemilik = Session.getEffectiveUser().getEmail();
  if (!aktif || aktif !== pemilik) {
    throw new Error('Fungsi ini hanya boleh dijalankan oleh pemilik dari editor Apps Script.');
  }
}

/**
 * Membuat satu akun baru dengan validasi lengkap. Mengembalikan ID pengguna.
 */
function buatPengguna_(data) {
  var nama = String(data.nama || '').trim();
  var username = String(data.username || '').trim().toLowerCase();
  var password = String(data.password || '');
  var role = String(data.role || '').trim().toUpperCase();
  var idKelompok = String(data.idKelompok || '').trim();

  if (nama.length < 3 || nama.length > 60) {
    throw buatGalat_('DATA_TIDAK_VALID', 'Nama harus 3 sampai 60 karakter.');
  }
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    throw buatGalat_('DATA_TIDAK_VALID', 'Username harus 3 sampai 30 karakter: huruf kecil, angka, titik, garis bawah, atau strip.');
  }
  validasiPassword_(password, username);
  if (role !== ROLE_ADMIN && role !== ROLE_PETUGAS) {
    throw buatGalat_('DATA_TIDAK_VALID', 'Role harus ADMIN atau PETUGAS.');
  }
  if (role === ROLE_PETUGAS && !idKelompok) {
    throw buatGalat_('DATA_TIDAK_VALID', 'Petugas wajib memiliki ID kelompok.');
  }

  var hash = buatHashPassword_(password);

  var kunci = LockService.getScriptLock();
  kunci.waitLock(10000);
  try {
    if (cariPenggunaByUsername_(username)) {
      throw buatGalat_('DATA_TIDAK_VALID', 'Username "' + username + '" sudah dipakai.');
    }
    var id = buatId_('USR');
    tambahBaris_('PENGGUNA', {
      ID_PENGGUNA: id,
      NAMA: nama,
      USERNAME: username,
      PASSWORD_HASH: hash,
      ROLE: role,
      ID_KELOMPOK: role === ROLE_ADMIN ? '' : idKelompok,
      STATUS_AKTIF: STATUS_AKTIF
    }, true);
    return id;
  } finally {
    kunci.releaseLock();
  }
}

/**
 * Membuat akun Admin pertama.
 * Data diambil dari Properti Skrip: ADMIN_NAMA, ADMIN_USERNAME, ADMIN_PASSWORD.
 * Properti tersebut dihapus otomatis setelah akun berhasil dibuat.
 * Ditolak jika sudah ada Admin aktif.
 */
function buatAdminPertama() {
  pastikanDijalankanPemilik_();

  var props = PropertiesService.getScriptProperties();
  var nama = props.getProperty('ADMIN_NAMA');
  var username = props.getProperty('ADMIN_USERNAME');
  var password = props.getProperty('ADMIN_PASSWORD');

  if (!nama || !username || !password) {
    throw new Error('Properti Skrip ADMIN_NAMA, ADMIN_USERNAME, dan ADMIN_PASSWORD belum diisi lengkap.');
  }

  var adaAdminAktif = bacaTabel_('PENGGUNA').some(function (r) {
    return String(r.ROLE).trim().toUpperCase() === ROLE_ADMIN && adalahAktif_(r.STATUS_AKTIF);
  });
  if (adaAdminAktif) {
    throw new Error('Sudah ada Admin aktif. Pembuatan Admin pertama dibatalkan demi keamanan.');
  }

  buatPengguna_({ nama: nama, username: username, password: password, role: ROLE_ADMIN, idKelompok: '' });

  props.deleteProperty('ADMIN_NAMA');
  props.deleteProperty('ADMIN_USERNAME');
  props.deleteProperty('ADMIN_PASSWORD');

  Logger.log('Admin pertama berhasil dibuat dengan username: ' + String(username).trim().toLowerCase());
  Logger.log('Properti sementara sudah dihapus otomatis.');
}

/**
 * Membuat akun petugas UJI untuk pengujian hak akses.
 * Properti Skrip yang dibutuhkan: PETUGAS_UJI_PASSWORD (dihapus otomatis setelah dipakai).
 * Username: petugas_uji, kelompok: KLP-UJI-A
 */
function buatPetugasUji() {
  pastikanDijalankanPemilik_();

  var props = PropertiesService.getScriptProperties();
  var password = props.getProperty('PETUGAS_UJI_PASSWORD');
  if (!password) {
    throw new Error('Properti Skrip PETUGAS_UJI_PASSWORD belum diisi.');
  }

  buatPengguna_({
    nama: 'Petugas Uji',
    username: 'petugas_uji',
    password: password,
    role: ROLE_PETUGAS,
    idKelompok: 'KLP-UJI-A'
  });

  props.deleteProperty('PETUGAS_UJI_PASSWORD');
  Logger.log('Petugas uji dibuat. Username: petugas_uji, kelompok: KLP-UJI-A');
}

/**
 * Menghapus akun petugas UJI setelah pengujian selesai.
 * Hanya menghapus baris dengan username petugas_uji dan kelompok KLP-UJI-A.
 */
function hapusPetugasUji() {
  pastikanDijalankanPemilik_();

  var kunci = LockService.getScriptLock();
  kunci.waitLock(10000);
  try {
    var daftar = bacaTabel_('PENGGUNA');
    var dihapus = 0;
    for (var i = daftar.length - 1; i >= 0; i--) {
      var r = daftar[i];
      if (String(r.USERNAME).trim().toLowerCase() === 'petugas_uji' &&
          String(r.ID_KELOMPOK).trim() === 'KLP-UJI-A') {
        ambilSheet_('PENGGUNA').deleteRow(r._baris);
        dihapus++;
      }
    }
    Logger.log('Akun petugas uji yang dihapus: ' + dihapus);
  } finally {
    kunci.releaseLock();
  }
}

/**
 * Mengukur lama pembuatan hash password. Dijalankan manual dari editor.
 */
function ujiKecepatanHash() {
  pastikanDijalankanPemilik_();
  var mulai = Date.now();
  var hash = buatHashPassword_('contoh-password-uji');
  var lama = Date.now() - mulai;
  Logger.log('Waktu membuat hash: ' + lama + ' milidetik');
  Logger.log('Contoh format hash: ' + hash.substring(0, 20) + '...');
  Logger.log(lama < 3000 ? 'OK: kecepatan wajar.' : 'LAMBAT: turunkan PBKDF2_ITERASI di Code.gs menjadi 1000.');
}