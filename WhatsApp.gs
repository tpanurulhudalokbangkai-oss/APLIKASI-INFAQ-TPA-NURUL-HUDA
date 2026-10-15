/**
 * WhatsApp.gs
 * Penyusunan pesan WhatsApp untuk orang tua santri.
 *
 * Aplikasi TIDAK mengirim pesan. Aplikasi hanya menyusun teks dan tautan wa.me;
 * pesan baru terkirim setelah pengguna menekan Kirim di WhatsApp.
 * Admin: semua kelompok. Petugas: hanya santri kelompoknya (dipaksa oleh server).
 */

/* ======================== TAUTAN WA.ME ======================== */

/**
 * Mengodekan teks untuk dipakai di alamat URL.
 * Tanda ! ' ( ) * ikut dikodekan karena encodeURIComponent membiarkannya apa adanya.
 */
function encodeUrlWa_(teks) {
  return encodeURIComponent(teks).replace(/[!'()*]/g, function (c) {
    return '%' + c.charCodeAt(0).toString(16).toUpperCase();
  });
}

/**
 * Membuat tautan wa.me. Nomor harus berformat 62 diikuti 8 sampai 13 angka.
 * Hasil: { url, alasan } dengan alasan kosong bila berhasil.
 */
function buatTautanWa_(nomor, pesan) {
  if (!/^62\d{8,13}$/.test(String(nomor))) {
    return { url: '', alasan: 'NOMOR_TIDAK_VALID' };
  }
  var url = 'https://wa.me/' + nomor + '?text=' + encodeUrlWa_(pesan);
  if (url.length > 2000) {
    return { url: '', alasan: 'TERLALU_PANJANG' };
  }
  return { url: url, alasan: '' };
}

/**
 * Menormalkan nomor tanpa melempar error. Mengembalikan teks kosong bila tidak valid.
 */
function normalisasiNomorWaAman_(mentah) {
  try {
    return normalisasiNomorWa_(mentah);
  } catch (err) {
    return '';
  }
}

/* ======================== ISI PESAN ======================== */

/**
 * Bulan yang sudah dibayar (transaksi sah) pada satu tahun, per santri: { idSantri: {bulan: true} }
 */
function bulanDibayarPerSantri_(tahun) {
  var peta = {};
  bacaTabel_('PEMBAYARAN').forEach(function (p) {
    if (!String(p.ID_PEMBAYARAN).trim() || !transaksiSah_(p)) { return; }
    if (Number(p.TAHUN) !== tahun) { return; }
    var bl = Number(p.BULAN);
    if (!(bl >= 1 && bl <= 12)) { return; }
    var id = String(p.ID_SANTRI).trim();
    if (!peta[id]) { peta[id] = {}; }
    peta[id][bl] = true;
  });
  return peta;
}

/**
 * Menyusun teks pesan. FUNGSI MURNI (tidak membaca spreadsheet) agar mudah diuji.
 * p: namaTpa, namaSantri, namaKelompok, tahun, bulanDibayar [1..12],
 *    bulanTertunggak [{tahun, bulan, nominal}], total
 */
function susunPesanWhatsApp_(p) {
  var teksDibayar = p.bulanDibayar.length
    ? p.bulanDibayar.map(function (b) { return NAMA_BULAN[b - 1]; }).join(', ')
    : '-';
  var teksBelum = p.bulanTertunggak.length ? ringkasBulanServer_(p.bulanTertunggak) : '-';
  var teksTotal = p.total > 0 ? formatRupiahServer_(p.total) : 'Rp0 (tidak ada tunggakan)';

  return [
    "Assalamu'alaikum warahmatullahi wabarakatuh.",
    '',
    'Bapak/Ibu orang tua/wali santri ' + p.namaTpa + ',',
    '',
    'Berikut informasi infaq bulanan:',
    '',
    'Nama Santri: ' + p.namaSantri,
    'Kelompok: ' + p.namaKelompok,
    'Tahun: ' + p.tahun,
    '',
    'Bulan sudah dibayar: ' + teksDibayar,
    'Bulan belum dibayar: ' + teksBelum,
    'Total tunggakan: ' + teksTotal,
    '',
    'Mohon dapat diperiksa. Jika pembayaran sudah dilakukan tetapi belum tercatat, silakan menghubungi petugas kelompok.',
    '',
    'Terima kasih.',
    '',
    "Wassalamu'alaikum warahmatullahi wabarakatuh."
  ].join('\n');
}

/* ======================== FUNGSI DARI BROWSER ======================== */

/**
 * Daftar penerima pesan beserta teks pesan dan tautan WhatsApp.
 * Admin: semua kelompok. Petugas: hanya kelompoknya (dipaksa oleh normalisasiFilterRekap_).
 * filter: { bulan, tahun, idKelompok, status, hanyaMenunggak, kata }
 */
function ambilDaftarWhatsApp(token, filter) {
  try {
    var profil = wajibLogin_(token);
    var f = normalisasiFilterRekap_(profil, filter, true);
    var d = hitungTunggakan_(profil, f);

    var hasil = {
      baris: [],
      kelompok: d.kelompok,
      tahun: f.tahun,
      bulan: f.bulan,
      tanpaNominal: d.tanpaNominal,
      tanpaTanggalBerhenti: d.tanpaTanggalBerhenti
    };
    if (d.tanpaNominal) {
      return { berhasil: true, data: hasil };
    }

    var kontak = {};
    bacaTabel_('SANTRI').forEach(function (s) {
      kontak[String(s.ID_SANTRI).trim()] = {
        nomorMentah: String(s.NOMOR_WA).trim(),
        namaOrangTua: String(s.NAMA_ORANG_TUA).trim()
      };
    });
    var dibayar = bulanDibayarPerSantri_(f.tahun);

    hasil.baris = d.baris.map(function (r) {
      var k = kontak[r.idSantri] || { nomorMentah: '', namaOrangTua: '' };
      var nomor = normalisasiNomorWaAman_(k.nomorMentah);
      var bulanDibayar = Object.keys(dibayar[r.idSantri] || {}).map(Number).sort(function (a, b) { return a - b; });

      var pesan = susunPesanWhatsApp_({
        namaTpa: APP_CONFIG.NAMA_TPA,
        namaSantri: r.nama,
        namaKelompok: r.namaKelompok,
        tahun: f.tahun,
        bulanDibayar: bulanDibayar,
        bulanTertunggak: r.bulanTertunggak,
        total: r.total
      });
      var tautan = buatTautanWa_(nomor, pesan);

      return {
        idSantri: r.idSantri,
        nis: r.nis,
        nama: r.nama,
        idKelompok: r.idKelompok,
        namaKelompok: r.namaKelompok,
        aktif: r.aktif,
        namaOrangTua: k.namaOrangTua,
        nomorWa: nomor,
        nomorMentah: k.nomorMentah,
        jumlah: r.jumlah,
        total: r.total,
        ringkasTunggakan: r.bulanTertunggak.length ? ringkasBulanServer_(r.bulanTertunggak) : 'Lunas',
        pesan: pesan,
        tautan: tautan.url,
        alasanTanpaTautan: tautan.alasan
      };
    });

    return { berhasil: true, data: hasil };
  } catch (err) {
    return galatKeRespons_(err);
  }
}

/* ======================== UJI OTOMATIS ======================== */

/**
 * Menguji isi pesan dan tautan dengan data buatan (tidak membaca spreadsheet).
 * Dijalankan manual dari editor.
 */
function ujiPesanWhatsApp() {
  pastikanDijalankanPemilik_();

  var hasil = [];
  function cek(nama, kondisi, rincian) {
    hasil.push((kondisi ? 'LULUS' : 'GAGAL') + ' - ' + nama + (rincian ? ' [' + rincian + ']' : ''));
  }

  var dasar = {
    namaTpa: 'TPA Nurul Huda', namaSantri: 'Ahmad Uji', namaKelompok: 'Kelompok A', tahun: 2026,
    bulanDibayar: [1, 2],
    bulanTertunggak: [{ tahun: 2026, bulan: 3, nominal: 25000 }, { tahun: 2026, bulan: 4, nominal: 25000 }],
    total: 50000
  };
  var pesan = susunPesanWhatsApp_(dasar);
  var penutup = "Wassalamu'alaikum warahmatullahi wabarakatuh.";

  cek('pesan diawali salam pembuka', pesan.indexOf("Assalamu'alaikum warahmatullahi wabarakatuh.") === 0);
  cek('pesan menyebut nama TPA pada sapaan', pesan.indexOf('Bapak/Ibu orang tua/wali santri TPA Nurul Huda,') > 0);
  cek('nama santri', pesan.indexOf('Nama Santri: Ahmad Uji') > 0);
  cek('kelompok', pesan.indexOf('Kelompok: Kelompok A') > 0);
  cek('tahun', pesan.indexOf('Tahun: 2026') > 0);
  cek('bulan sudah dibayar', pesan.indexOf('Bulan sudah dibayar: Januari, Februari') > 0);
  cek('bulan belum dibayar', pesan.indexOf('Bulan belum dibayar: Maret, April 2026') > 0);
  cek('total tunggakan', pesan.indexOf('Total tunggakan: Rp50.000') > 0);
  cek('kalimat meminta memeriksa', pesan.indexOf('silakan menghubungi petugas kelompok.') > 0);
  cek('diakhiri salam penutup', pesan.slice(-penutup.length) === penutup);

  var lunas = susunPesanWhatsApp_({
    namaTpa: 'TPA Nurul Huda', namaSantri: 'Fatimah Uji', namaKelompok: 'Kelompok A', tahun: 2026,
    bulanDibayar: [1, 2, 3], bulanTertunggak: [], total: 0
  });
  cek('tanpa tunggakan: bulan belum dibayar tertulis -', lunas.indexOf('Bulan belum dibayar: -') > 0);
  cek('tanpa tunggakan: total Rp0', lunas.indexOf('Total tunggakan: Rp0 (tidak ada tunggakan)') > 0);

  var belumAdaBayar = susunPesanWhatsApp_({
    namaTpa: 'TPA Nurul Huda', namaSantri: 'Umar Uji', namaKelompok: 'Kelompok B', tahun: 2026,
    bulanDibayar: [], bulanTertunggak: [{ tahun: 2026, bulan: 1, nominal: 25000 }], total: 25000
  });
  cek('belum ada pembayaran: bulan sudah dibayar tertulis -', belumAdaBayar.indexOf('Bulan sudah dibayar: -') > 0);

  var lintasTahun = susunPesanWhatsApp_({
    namaTpa: 'TPA Nurul Huda', namaSantri: 'Aisyah Uji', namaKelompok: 'Kelompok B', tahun: 2026,
    bulanDibayar: [], bulanTertunggak: [{ tahun: 2025, bulan: 12, nominal: 25000 }, { tahun: 2026, bulan: 1, nominal: 25000 }], total: 50000
  });
  cek('tunggakan lintas tahun ditulis dengan tahunnya', lintasTahun.indexOf('Bulan belum dibayar: Desember 2025; Januari 2026') > 0);
  cek('format ribuan rupiah', formatRupiahServer_(1234567) === 'Rp1.234.567');

  // Tautan
  var tautan = buatTautanWa_('6281234567890', pesan);
  var teksUrl = tautan.url.substring(tautan.url.indexOf('?text=') + 6);
  cek('tautan diawali alamat wa.me dan nomor', tautan.url.indexOf('https://wa.me/6281234567890?text=') === 0);
  cek('teks pesan pada tautan dapat dikembalikan persis sama', decodeURIComponent(teksUrl) === pesan);
  cek('tautan tanpa spasi atau tanda petik', !/[\s']/.test(tautan.url));
  cek('baris baru dikodekan %0A dan petik dikodekan %27', teksUrl.indexOf('%0A') > 0 && teksUrl.indexOf('%27') > 0);

  var khusus = susunPesanWhatsApp_({
    namaTpa: 'TPA Nurul Huda', namaSantri: 'Ahmad & Fatimah #1 "A"?', namaKelompok: 'Kelompok A', tahun: 2026,
    bulanDibayar: [], bulanTertunggak: [], total: 0
  });
  var tautanKhusus = buatTautanWa_('6281234567890', khusus);
  var teksKhusus = tautanKhusus.url.substring(tautanKhusus.url.indexOf('?text=') + 6);
  cek('karakter khusus & # " ? aman dan kembali utuh',
    teksKhusus.indexOf('&') < 0 && teksKhusus.indexOf('#') < 0 && decodeURIComponent(teksKhusus) === khusus);

  // Nomor
  cek('nomor tanpa awalan 62 ditolak', buatTautanWa_('081234567890', pesan).alasan === 'NOMOR_TIDAK_VALID');
  cek('nomor berisi sisipan &text= ditolak', buatTautanWa_('62812345678&text=x', pesan).alasan === 'NOMOR_TIDAK_VALID');
  cek('nomor huruf ditolak', buatTautanWa_('abc', pesan).alasan === 'NOMOR_TIDAK_VALID');
  cek('nomor kosong ditolak', buatTautanWa_('', pesan).alasan === 'NOMOR_TIDAK_VALID');
  cek('normalisasi 0812-3456-7890', normalisasiNomorWaAman_('0812-3456-7890') === '6281234567890');
  cek('normalisasi +62 812 3456 7890', normalisasiNomorWaAman_('+62 812 3456 7890') === '6281234567890');
  cek('normalisasi huruf menghasilkan kosong', normalisasiNomorWaAman_('abc') === '');
  cek('normalisasi kosong menghasilkan kosong', normalisasiNomorWaAman_('') === '');

  // Pesan terlalu panjang
  var banyak = [];
  for (var th = 2000; th <= 2024; th++) {
    for (var bl = 1; bl <= 12; bl++) { banyak.push({ tahun: th, bulan: bl, nominal: 25000 }); }
  }
  var panjang = susunPesanWhatsApp_({
    namaTpa: 'TPA Nurul Huda', namaSantri: 'Uji Panjang', namaKelompok: 'Kelompok A', tahun: 2026,
    bulanDibayar: [], bulanTertunggak: banyak, total: 25000 * banyak.length
  });
  cek('pesan sangat panjang tidak dibuatkan tautan', buatTautanWa_('6281234567890', panjang).alasan === 'TERLALU_PANJANG');

  hasil.forEach(function (b) { Logger.log(b); });
  var gagal = hasil.filter(function (b) { return b.indexOf('GAGAL') === 0; }).length;
  Logger.log(gagal === 0 ? 'HASIL: SEMUA PENGUJIAN LULUS.' : 'HASIL: ' + gagal + ' PENGUJIAN GAGAL. Kirim log ini kepada saya.');
}

/**
 * Membuktikan Petugas hanya mendapat santri kelompoknya sendiri walau filter dimanipulasi.
 * Butuh akun petugas_uji yang punya kelompok. Tidak mengubah data apa pun.
 */
function ujiHakAksesTahap10() {
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

  var sekarang = waktuSekarang_();
  var token = buatSesi_(String(petugas.ID_PENGGUNA).trim());
  var hasil = [];

  try {
    var r = ambilDaftarWhatsApp(token, { bulan: sekarang.bulan, tahun: sekarang.tahun, idKelompok: idLain, status: 'SEMUA', hanyaMenunggak: false });
    if (!r.berhasil) {
      hasil.push('GAGAL - ambilDaftarWhatsApp oleh Petugas -> ' + r.kode);
    } else if (r.data.tanpaNominal) {
      hasil.push('LEWATI - nominal infaq belum diatur, uji cakupan dilewati.');
    } else {
      var bocor = r.data.baris.some(function (x) { return x.idKelompok !== idKelompok; });
      var kelompokBocor = r.data.kelompok.some(function (k) { return k.id !== idKelompok; });
      hasil.push((!bocor ? 'LULUS' : 'GAGAL') + ' - filter kelompok lain diabaikan, hanya kelompok sendiri (' + r.data.baris.length + ' santri)');
      hasil.push((!kelompokBocor ? 'LULUS' : 'GAGAL') + ' - daftar kelompok untuk Petugas hanya berisi kelompok sendiri');
    }

    var palsu = ambilDaftarWhatsApp('abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH', {});
    hasil.push((palsu.berhasil === false && palsu.kode === 'SESI_HABIS' ? 'LULUS' : 'GAGAL') + ' - token palsu ditolak (SESI_HABIS)');
  } finally {
    CacheService.getScriptCache().remove(kunciSesi_(token));
  }

  hasil.forEach(function (b) { Logger.log(b); });
  var gagal = hasil.filter(function (b) { return b.indexOf('GAGAL') === 0; }).length;
  Logger.log(gagal === 0 ? 'HASIL: SEMUA PENGUJIAN LULUS.' : 'HASIL: ' + gagal + ' PENGUJIAN GAGAL. Kirim log ini kepada saya.');
}