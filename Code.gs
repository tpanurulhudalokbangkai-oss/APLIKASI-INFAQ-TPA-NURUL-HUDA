/**
 * Code.gs
 * Pintu masuk aplikasi web dan pengaturan umum.
 */

var APP_CONFIG = {
  NAMA_APLIKASI: 'Aplikasi Infaq TPA Nurul Huda',
  NAMA_TPA: 'TPA Nurul Huda',
  ZONA_WAKTU: 'Asia/Makassar',
  SESI_DETIK: 21600,         // masa berlaku sesi: 6 jam (batas maksimum CacheService)
  MAKS_GAGAL_LOGIN: 5,       // salah password sebanyak ini, username dikunci sementara
  DURASI_KUNCI_DETIK: 900,   // lama kunci: 15 menit
  PBKDF2_ITERASI: 2000       // tingkat pengacakan password
};

/**
 * Berkas HTML yang boleh disisipkan oleh include().
 * Tambahkan nama berkas baru di sini bila suatu hari ada berkas HTML tambahan.
 */
var MODUL_HTML_DIIZINKAN = [
  'CSS', 'CSS_Master', 'JavaScript', 'JS_Master', 'JS_Pembayaran',
  'JS_Rekap', 'JS_Tahunan', 'JS_Laporan', 'JS_WhatsApp'
];

/**
 * Dijalankan otomatis saat URL Web App dibuka di browser.
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP_CONFIG.NAMA_APLIKASI)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Menyisipkan isi file HTML lain ke Index.html. Hanya berkas yang terdaftar yang diizinkan.
 */
function include(namaFile) {
  if (MODUL_HTML_DIIZINKAN.indexOf(String(namaFile)) < 0) {
    throw new Error('Berkas tidak diizinkan.');
  }
  return HtmlService.createHtmlOutputFromFile(namaFile).getContent();
}