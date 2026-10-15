/**
 * Api.gs
 * FILE BARU - Tahap 13 (prototipe halaman login di Vercel).
 *
 * Pintu API untuk halaman yang dihosting di luar Apps Script (misalnya Vercel).
 * File ini TIDAK mengubah kode lama. doGet() di Code.gs tetap melayani Web App yang sudah ada.
 *
 * Cara kerja:
 *   - Halaman di Vercel mengirim POST berisi JSON: { "fn": "nama_fungsi", "args": [ ... ] }
 *   - Hanya fungsi yang terdaftar di daftar putih di bawah yang boleh dipanggil.
 *   - Token sesi dan hak akses tetap diperiksa oleh fungsi lama (wajibLogin_, dst.),
 *     jadi aturan keamanan Admin/Petugas tidak berubah.
 *
 * Untuk prototipe ini, daftar putih sengaja hanya 3 fungsi.
 * Fungsi lain ditambahkan nanti, satu tahap per giliran.
 */

var API_MAKS_KARAKTER = 20000;   // batas ukuran isi permintaan
var API_MAKS_ARGUMEN = 5;        // batas jumlah argumen per panggilan

function doPost(e) {
  var hasil;
  try {
    var mentah = (e && e.postData && e.postData.contents) ? String(e.postData.contents) : '';
    if (!mentah || mentah.length > API_MAKS_KARAKTER) {
      hasil = galatApi_('Permintaan tidak valid.');
    } else {
      var minta = JSON.parse(mentah);
      var nama = String(minta && minta.fn ? minta.fn : '');
      var args = (minta && Array.isArray(minta.args)) ? minta.args : [];

      // Daftar putih dibuat di dalam fungsi (bukan di luar) supaya tidak bergantung pada urutan muat file.
      var diizinkan = {
        login: login,
        logout: logout,
        ambilSesi: ambilSesi
      };

      if (!Object.prototype.hasOwnProperty.call(diizinkan, nama)) {
        hasil = galatApi_('Fungsi tidak dikenal.');
      } else if (args.length > API_MAKS_ARGUMEN) {
        hasil = galatApi_('Permintaan tidak valid.');
      } else {
        hasil = diizinkan[nama].apply(null, args);
      }
    }
  } catch (err) {
    console.error(err);
    hasil = galatApi_('Terjadi kesalahan pada server.');
  }

  return ContentService
    .createTextOutput(JSON.stringify(hasil))
    .setMimeType(ContentService.MimeType.JSON);
}

function galatApi_(pesan) {
  return { berhasil: false, kode: 'DATA_TIDAK_VALID', pesan: pesan };
}
