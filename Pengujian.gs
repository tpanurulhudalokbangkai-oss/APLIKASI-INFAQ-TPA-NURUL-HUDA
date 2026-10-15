/**
 * Pengujian.gs
 * Tahap 11: pengujian menyeluruh.
 *
 * Fungsi yang bisa dijalankan dari editor:
 *   ujiSemua()            menjalankan semua uji otomatis (cepat, tanpa ekspor)
 *   ujiSemuaLengkap()     sama seperti ujiSemua(), ditambah uji ekspor Excel dan PDF
 *   ujiAnalisisEndpoint() memastikan setiap fungsi publik terlindungi dan terdaftar
 *   ujiMatriksHakAkses()  menguji hak akses semua endpoint (Admin, Petugas, token palsu)
 *   ujiSesiDanRiwayat()   menguji pemutusan sesi dan pencatatan perubahan (data sementara)
 *   periksaIntegritasData() memeriksa kesehatan data (hanya membaca)
 */

/* ======================== PEMBANTU ======================== */

function cariAdminAktif_() {
  var daftar = bacaTabel_('PENGGUNA');
  for (var i = 0; i < daftar.length; i++) {
    if (String(daftar[i].ROLE).trim().toUpperCase() === ROLE_ADMIN && adalahAktif_(daftar[i].STATUS_AKTIF)) {
      return daftar[i];
    }
  }
  return null;
}

function hapusBarisBerdasarId_(namaSheet, kolom, nilai) {
  if (!nilai) { return; }
  dalamKunci_(function () {
    var b = cariBaris_(bacaTabel_(namaSheet), kolom, nilai);
    if (b) { ambilSheet_(namaSheet).deleteRow(b._baris); }
  });
}

/* ======================== MENJALANKAN SEMUA UJI ======================== */

function jalankanSemuaUji_(sertakanEkspor) {
  var global = (typeof globalThis !== 'undefined') ? globalThis : this;

  var daftar = [
    ['Tahap 5  - hak akses data santri, kelompok, petugas', 'ujiHakAksesTahap5'],
    ['Tahap 6  - hak akses pembayaran', 'ujiHakAksesTahap6'],
    ['Tahap 6  - nominal opsional', 'ujiNominalOpsional'],
    ['Tahap 7  - perhitungan tunggakan', 'ujiPerhitunganTunggakan'],
    ['Tahap 7  - hak akses rekap', 'ujiHakAksesTahap7'],
    ['Tahap 8  - rekap tahunan', 'ujiRekapTahunan'],
    ['Tahap 8  - hak akses rekap tahunan', 'ujiHakAksesTahap8'],
    ['Tahap 9  - hak akses ekspor', 'ujiHakAksesTahap9'],
    ['Tahap 10 - pesan dan tautan WhatsApp', 'ujiPesanWhatsApp'],
    ['Tahap 10 - hak akses WhatsApp', 'ujiHakAksesTahap10'],
    ['Tahap 11 - analisis fungsi publik', 'ujiAnalisisEndpoint'],
    ['Tahap 11 - matriks hak akses', 'ujiMatriksHakAkses'],
    ['Tahap 11 - pemutusan sesi dan riwayat perubahan', 'ujiSesiDanRiwayat']
  ];
  if (sertakanEkspor) {
    daftar.push(['Tahap 9  - ekspor Excel dan PDF (data nyata)', 'ujiEkspor']);
  }

  var ringkasan = [];
  var hitung = { lulus: 0, gagal: 0, dilewati: 0 };

  daftar.forEach(function (d) {
    var nama = d[0];
    var fn = global[d[1]];
    if (typeof fn !== 'function') {
      ringkasan.push('DILEWATI - ' + nama + ' (fungsi ' + d[1] + ' belum ada)');
      hitung.dilewati++;
      return;
    }

    var awal = Logger.getLog().length;
    try {
      fn();
      var log = Logger.getLog().substring(awal);
      if (log.indexOf('SEMUA PENGUJIAN LULUS') >= 0) {
        ringkasan.push('LULUS    - ' + nama);
        hitung.lulus++;
      } else if (log.indexOf('HASIL: DILEWATI') >= 0) {
        ringkasan.push('DILEWATI - ' + nama);
        hitung.dilewati++;
      } else {
        ringkasan.push('GAGAL    - ' + nama + ' (lihat rincian di log di atas)');
        hitung.gagal++;
      }
    } catch (err) {
      var pesan = String(err && err.message ? err.message : err);
      if (/petugas_uji|Akun petugas|Tidak ada akun Admin/.test(pesan)) {
        ringkasan.push('DILEWATI - ' + nama + ' (prasyarat belum ada: ' + pesan + ')');
        hitung.dilewati++;
      } else {
        ringkasan.push('GAGAL    - ' + nama + ' (error: ' + pesan + ')');
        hitung.gagal++;
      }
    }
  });

  Logger.log('==================== RINGKASAN PENGUJIAN MENYELURUH ====================');
  ringkasan.forEach(function (b) { Logger.log(b); });
  Logger.log('Lulus: ' + hitung.lulus + ' | Gagal: ' + hitung.gagal + ' | Dilewati: ' + hitung.dilewati);
  Logger.log(hitung.gagal === 0
    ? 'HASIL AKHIR: TIDAK ADA YANG GAGAL' + (hitung.dilewati ? ' (ada yang dilewati karena prasyarat belum ada).' : '.')
    : 'HASIL AKHIR: ADA ' + hitung.gagal + ' UJI YANG GAGAL. Kirim seluruh log ini kepada saya.');
}

/**
 * Menjalankan semua uji otomatis tanpa ekspor. Sekitar 1 sampai 2 menit.
 */
function ujiSemua() {
  pastikanDijalankanPemilik_();
  jalankanSemuaUji_(false);
}

/**
 * Menjalankan semua uji otomatis termasuk uji ekspor Excel dan PDF. Sekitar 2 sampai 3 menit.
 */
function ujiSemuaLengkap() {
  pastikanDijalankanPemilik_();
  jalankanSemuaUji_(true);
}

/* ======================== ANALISIS FUNGSI PUBLIK ======================== */

/**
 * Memeriksa kode sumber setiap fungsi yang bisa dipanggil dari browser:
 * - endpoint harus memanggil wajibLogin_ (dan wajibAdmin_ bila khusus Admin),
 * - fungsi untuk pemilik harus memanggil pastikanDijalankanPemilik_,
 * - fungsi publik yang tidak dikenal DITOLAK, supaya fungsi baru tidak lupa dilindungi.
 * Tidak mengubah data apa pun.
 */
function ujiAnalisisEndpoint() {
  pastikanDijalankanPemilik_();

  var global = (typeof globalThis !== 'undefined') ? globalThis : this;
  var sumberSendiri = Function.prototype.toString.call(ujiAnalisisEndpoint);
  if (sumberSendiri.indexOf('pastikanDijalankanPemilik_') < 0) {
    Logger.log('Kode sumber fungsi tidak dapat dibaca di lingkungan ini.');
    Logger.log('HASIL: DILEWATI.');
    return;
  }

  var TERBUKA = ['doGet', 'include', 'login', 'logout'];
  var ADMIN = [
    'simpanSantri', 'ubahStatusSantri', 'ambilDataKelompok', 'simpanKelompok', 'ubahStatusKelompok',
    'ambilDataPetugas', 'simpanPetugas', 'resetPasswordPetugas', 'ubahStatusPetugas',
    'simpanNominalInfaq', 'batalkanPembayaran', 'ambilRekapTahunan', 'buatLaporan'
  ];
  var BERCAKUPAN = [
    'ambilDaftarSantri', 'ambilDashboard', 'simpanPembayaran', 'ambilStatusBayarSantri',
    'ambilRiwayatPembayaran', 'ambilRekapPembayaran', 'ambilRekapTunggakan', 'ambilDaftarWhatsApp'
  ];
  var SESI_SAJA = ['ambilSesi', 'ambilNominalInfaq'];
  var TANDA_CAKUPAN = ['wajibAksesKelompok_(', 'normalisasiFilterRekap_(', 'profil.idKelompok', 'hitungDashboard_('];

  var hasil = [];
  var hitung = { terbuka: 0, editor: 0, admin: 0, cakupan: 0, sesi: 0 };
  var ditemukan = {};

  function cek(nama, kondisi, rincian) {
    hasil.push((kondisi ? 'LULUS' : 'GAGAL') + ' - ' + nama + (rincian ? ' [' + rincian + ']' : ''));
  }

  Object.getOwnPropertyNames(global).forEach(function (n) {
    var fn;
    try { fn = global[n]; } catch (e) { return; }
    if (typeof fn !== 'function' || /_$/.test(n)) { return; }

    var src = Function.prototype.toString.call(fn);
    if (src.indexOf('[native code]') >= 0) { return; }
    ditemukan[n] = true;

    if (TERBUKA.indexOf(n) >= 0) {
      hitung.terbuka++;
      if (n === 'include') { cek('include() hanya menerima berkas yang terdaftar', src.indexOf('MODUL_HTML_DIIZINKAN') >= 0); }
      if (n === 'login') { cek('login() membatasi percobaan gagal', src.indexOf('sedangDikunci_(') >= 0); }
      return;
    }
    if (src.indexOf('pastikanDijalankanPemilik_(') >= 0) {
      hitung.editor++;
      return;
    }

    var punyaSesi = src.indexOf('wajibLogin_(') >= 0;
    if (ADMIN.indexOf(n) >= 0) {
      hitung.admin++;
      cek(n + ' memeriksa sesi dan peran Admin', punyaSesi && src.indexOf('wajibAdmin_(') >= 0);
    } else if (BERCAKUPAN.indexOf(n) >= 0) {
      hitung.cakupan++;
      var adaTanda = TANDA_CAKUPAN.some(function (t) { return src.indexOf(t) >= 0; });
      cek(n + ' memeriksa sesi dan membatasi cakupan data', punyaSesi && adaTanda);
    } else if (SESI_SAJA.indexOf(n) >= 0) {
      hitung.sesi++;
      cek(n + ' memeriksa sesi', punyaSesi);
    } else {
      cek('fungsi publik "' + n + '" TIDAK TERDAFTAR dan tidak terlindungi', false,
        'beri akhiran _ bila privat, atau lindungi dan daftarkan di Pengujian.gs');
    }
  });

  [TERBUKA, ADMIN, BERCAKUPAN, SESI_SAJA].forEach(function (daftar) {
    daftar.forEach(function (n) {
      if (!ditemukan[n]) { cek('fungsi terdaftar "' + n + '" tidak ditemukan di proyek', false, 'daftar usang atau file belum dibuat'); }
    });
  });

  var gagalLama = hasil.filter(function (b) { return b.indexOf('GAGAL') === 0; });
  hasil = gagalLama.length ? hasil.filter(function (b) { return b.indexOf('GAGAL') === 0; }) : [];
  if (!gagalLama.length) {
    hasil.push('LULUS - semua fungsi publik terklasifikasi dan terlindungi: ' +
      hitung.terbuka + ' terbuka (doGet, include, login, logout), ' +
      hitung.admin + ' khusus Admin, ' + hitung.cakupan + ' dengan batas cakupan, ' +
      hitung.sesi + ' cukup sesi, ' + hitung.editor + ' khusus pemilik dari editor');
  }

  hasil.forEach(function (b) { Logger.log(b); });
  var gagal = hasil.filter(function (b) { return b.indexOf('GAGAL') === 0; }).length;
  Logger.log(gagal === 0 ? 'HASIL: SEMUA PENGUJIAN LULUS.' : 'HASIL: ' + gagal + ' PENGUJIAN GAGAL. Kirim log ini kepada saya.');
}

/* ======================== MATRIKS HAK AKSES ======================== */

/**
 * Memanggil SEMUA endpoint dengan token palsu, token aneh, sesi kedaluwarsa, token Petugas,
 * dan token Admin (hanya endpoint baca). Tidak mengubah data apa pun.
 */
function ujiMatriksHakAkses() {
  pastikanDijalankanPemilik_();

  var global = (typeof globalThis !== 'undefined') ? globalThis : this;
  var hasil = [];
  function cek(nama, kondisi, rincian) {
    hasil.push((kondisi ? 'LULUS' : 'GAGAL') + ' - ' + nama + (rincian ? ' [' + rincian + ']' : ''));
  }
  function panggil(nama, token, args) { return global[nama].apply(null, [token].concat(args)); }
  function ringkas(r) { return r ? (r.berhasil ? 'DITERIMA' : r.kode) : 'tanpa respons'; }

  var ARGUMEN = {
    ambilSesi: [],
    ambilDashboard: [],
    ambilNominalInfaq: [],
    ambilDaftarSantri: [],
    simpanSantri: [{}],
    ubahStatusSantri: ['x', false, '2026-01-01'],
    ambilDataKelompok: [],
    simpanKelompok: [{ nama: 'Uji' }],
    ubahStatusKelompok: ['x', false],
    ambilDataPetugas: [],
    simpanPetugas: [{}],
    resetPasswordPetugas: ['x', 'abcdefgh12'],
    ubahStatusPetugas: ['x', false],
    simpanNominalInfaq: [{ nominal: 25000, bulan: 1, tahun: 2026 }],
    ambilStatusBayarSantri: ['x', 2026],
    ambilRiwayatPembayaran: [0],
    simpanPembayaran: [{}],
    batalkanPembayaran: ['x', 'alasan pengujian'],
    ambilRekapPembayaran: [{}],
    ambilRekapTunggakan: [{}],
    ambilRekapTahunan: [{}],
    buatLaporan: [{ jenis: 'PEMBAYARAN', format: 'XLSX', filter: {} }],
    ambilDaftarWhatsApp: [{}]
  };
  var ADMIN_SAJA = [
    'simpanSantri', 'ubahStatusSantri', 'ambilDataKelompok', 'simpanKelompok', 'ubahStatusKelompok',
    'ambilDataPetugas', 'simpanPetugas', 'resetPasswordPetugas', 'ubahStatusPetugas',
    'simpanNominalInfaq', 'batalkanPembayaran', 'ambilRekapTahunan', 'buatLaporan'
  ];
  var BOLEH_PETUGAS = [
    'ambilSesi', 'ambilDashboard', 'ambilNominalInfaq', 'ambilDaftarSantri',
    'ambilRiwayatPembayaran', 'ambilRekapPembayaran', 'ambilRekapTunggakan', 'ambilDaftarWhatsApp'
  ];
  var BACA_ADMIN = [
    'ambilSesi', 'ambilDashboard', 'ambilNominalInfaq', 'ambilDaftarSantri', 'ambilDataKelompok',
    'ambilDataPetugas', 'ambilRiwayatPembayaran', 'ambilRekapPembayaran', 'ambilRekapTunggakan',
    'ambilRekapTahunan', 'ambilDaftarWhatsApp'
  ];
  var tokenPalsu = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH';
  var semuaNama = Object.keys(ARGUMEN);

  // A. Token palsu
  var salahA = [];
  semuaNama.forEach(function (n) {
    var r = panggil(n, tokenPalsu, ARGUMEN[n]);
    if (!(r && r.berhasil === false && r.kode === 'SESI_HABIS')) { salahA.push(n + ' -> ' + ringkas(r)); }
  });
  cek('token palsu ditolak (SESI_HABIS) oleh semua ' + semuaNama.length + ' endpoint', salahA.length === 0, salahA.join('; '));

  // B. Token bertipe atau berbentuk aneh
  var tokenAneh = [undefined, null, '', 12345, {}, [], 'a', new Array(300).join('x')];
  var salahB = [];
  tokenAneh.forEach(function (t, i) {
    ['ambilSesi', 'ambilDashboard', 'simpanSantri'].forEach(function (n) {
      var r = panggil(n, t, ARGUMEN[n]);
      if (!(r && r.berhasil === false && r.kode === 'SESI_HABIS')) { salahB.push(n + '#' + i + ' -> ' + ringkas(r)); }
    });
  });
  cek('token bertipe atau berbentuk aneh (kosong, angka, objek, terlalu panjang) ditolak', salahB.length === 0, salahB.join('; '));

  // C. Sesi kedaluwarsa
  var admin = cariAdminAktif_();
  if (!admin) { throw new Error('Tidak ada akun Admin aktif untuk pengujian ini.'); }
  var idAdmin = String(admin.ID_PENGGUNA).trim();

  var tokenKedaluwarsa = 'k' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put(kunciSesi_(tokenKedaluwarsa),
    JSON.stringify({ idPengguna: idAdmin, kedaluwarsa: Date.now() - 1000 }), 600);
  var rk = ambilSesi(tokenKedaluwarsa);
  cek('sesi yang sudah kedaluwarsa ditolak', rk.berhasil === false && rk.kode === 'SESI_HABIS');

  // D. Token Admin (hanya endpoint baca)
  var tokenAdmin = buatSesi_(idAdmin);
  try {
    var salahD = [];
    BACA_ADMIN.forEach(function (n) {
      var r = panggil(n, tokenAdmin, ARGUMEN[n]);
      if (!(r && r.berhasil === true)) { salahD.push(n + ' -> ' + ringkas(r)); }
    });
    cek('Admin dapat memakai ' + BACA_ADMIN.length + ' endpoint baca', salahD.length === 0, salahD.join('; '));
  } finally {
    CacheService.getScriptCache().remove(kunciSesi_(tokenAdmin));
  }

  // E. Token Petugas
  var petugas = cariPenggunaByUsername_('petugas_uji');
  var petugasSiap = petugas && String(petugas.ROLE).trim().toUpperCase() === ROLE_PETUGAS && String(petugas.ID_KELOMPOK).trim();
  if (!petugasSiap) {
    hasil.push('LEWATI - akun petugas_uji (dengan kelompok) belum ada, uji untuk Petugas dilewati.');
  } else {
    var idKelompok = String(petugas.ID_KELOMPOK).trim();
    var idLain = 'KLP-TIDAK-ADA';
    Object.keys(petaKelompok_()).forEach(function (id) { if (id !== idKelompok) { idLain = id; } });

    var tokenPetugas = buatSesi_(String(petugas.ID_PENGGUNA).trim());
    try {
      var salahE = [];
      ADMIN_SAJA.forEach(function (n) {
        var r = panggil(n, tokenPetugas, ARGUMEN[n]);
        if (!(r && r.berhasil === false && r.kode === 'DILARANG')) { salahE.push(n + ' -> ' + ringkas(r)); }
      });
      cek('Petugas ditolak (DILARANG) oleh ' + ADMIN_SAJA.length + ' endpoint khusus Admin', salahE.length === 0, salahE.join('; '));

      var salahF = [];
      BOLEH_PETUGAS.forEach(function (n) {
        var r = panggil(n, tokenPetugas, ARGUMEN[n]);
        if (!(r && r.berhasil === true)) { salahF.push(n + ' -> ' + ringkas(r)); }
      });
      cek('Petugas dapat memakai ' + BOLEH_PETUGAS.length + ' endpoint miliknya', salahF.length === 0, salahF.join('; '));

      // Cakupan: filter kelompok lain harus diabaikan
      var cakupan = [
        ['ambilDaftarSantri', [], function (r) { return r.data.santri; }],
        ['ambilRiwayatPembayaran', [0], function (r) { return r.data.transaksi; }],
        ['ambilRekapPembayaran', [{ tahun: 0, idKelompok: idLain }], function (r) { return r.data.baris; }],
        ['ambilRekapTunggakan', [{ idKelompok: idLain, hanyaMenunggak: false }], function (r) { return r.data.baris; }],
        ['ambilDaftarWhatsApp', [{ idKelompok: idLain, hanyaMenunggak: false }], function (r) { return r.data.baris; }]
      ];
      var salahG = [];
      cakupan.forEach(function (c) {
        var r = panggil(c[0], tokenPetugas, c[1]);
        if (!(r && r.berhasil)) { salahG.push(c[0] + ' -> ' + ringkas(r)); return; }
        var bocor = c[2](r).some(function (x) { return x.idKelompok !== idKelompok; });
        if (bocor) { salahG.push(c[0] + ' -> BOCOR data kelompok lain'); }
      });
      cek('Petugas hanya menerima data kelompoknya pada ' + cakupan.length + ' endpoint (filter kelompok lain diabaikan)', salahG.length === 0, salahG.join('; '));
    } finally {
      CacheService.getScriptCache().remove(kunciSesi_(tokenPetugas));
    }
  }

  hasil.forEach(function (b) { Logger.log(b); });
  var gagal = hasil.filter(function (b) { return b.indexOf('GAGAL') === 0; }).length;
  Logger.log(gagal === 0 ? 'HASIL: SEMUA PENGUJIAN LULUS.' : 'HASIL: ' + gagal + ' PENGUJIAN GAGAL. Kirim log ini kepada saya.');
}

/* ======================== SESI DAN RIWAYAT PERUBAHAN ======================== */

/**
 * Menguji dua perbaikan Tahap 11 dengan DATA SEMENTARA (dibuat lalu dihapus otomatis):
 * 1) sesi lama terputus setelah reset password, dan tidak hidup lagi setelah akun dinonaktifkan lalu diaktifkan,
 * 2) perubahan data petugas, kelompok, dan santri tercatat (tanpa password/hash).
 * Baris riwayat yang dihasilkan tetap tersimpan sebagai jejak pengujian.
 */
function ujiSesiDanRiwayat() {
  pastikanDijalankanPemilik_();

  var hasil = [];
  function cek(nama, kondisi, rincian) {
    hasil.push((kondisi ? 'LULUS' : 'GAGAL') + ' - ' + nama + (rincian ? ' [' + rincian + ']' : ''));
  }

  var admin = cariAdminAktif_();
  if (!admin) { throw new Error('Tidak ada akun Admin aktif untuk pengujian ini.'); }
  var idAdmin = String(admin.ID_PENGGUNA).trim();
  var tokenAdmin = buatSesi_(idAdmin);

  var stempel = Utilities.getUuid().replace(/-/g, '').substring(0, 6).toLowerCase();
  var username = 'uji_t11_' + stempel;
  var passwordLama = 'PwLama' + stempel + '#1';
  var passwordBaru = 'PwBaru' + stempel + '#2';
  var hariIni = Utilities.formatDate(new Date(), APP_CONFIG.ZONA_WAKTU, 'yyyy-MM-dd');
  var idUser = '';
  var idKelompok = '';
  var idSantri = '';
  var barisAwalLog = ambilSheet_('RIWAYAT_PERUBAHAN').getLastRow();

  KONTEKS_PENGGUNA_ = null;

  try {
    // 1. Akun petugas sementara dan login
    idUser = buatPengguna_({ nama: 'Petugas Uji T11', username: username, password: passwordLama, role: ROLE_PETUGAS, idKelompok: 'KLP-UJI-T11' });
    var l1 = login(username, passwordLama);
    cek('login akun sementara berhasil', l1.berhasil === true);
    var token1 = l1.token;
    cek('sesi akun sementara aktif', ambilSesi(token1).berhasil === true);

    // 2. Reset password lewat endpoint Admin
    var reset = resetPasswordPetugas(tokenAdmin, idUser, passwordBaru);
    cek('reset password oleh Admin berhasil', reset.berhasil === true, reset.pesan);
    var sLama = ambilSesi(token1);
    cek('SESI LAMA TERPUTUS setelah reset password', sLama.berhasil === false && sLama.kode === 'SESI_HABIS');
    cek('login dengan password lama ditolak', login(username, passwordLama).berhasil === false);
    var l2 = login(username, passwordBaru);
    cek('login dengan password baru berhasil', l2.berhasil === true);
    cek('sesi baru (sesudah reset) aktif', ambilSesi(l2.token).berhasil === true);

    // 3. Nonaktifkan lalu aktifkan kembali (lewat lapisan data)
    var b1 = cariBaris_(bacaTabel_('PENGGUNA'), 'ID_PENGGUNA', idUser);
    perbaruiBaris_('PENGGUNA', b1._baris, { STATUS_AKTIF: STATUS_NONAKTIF }, true);
    var sNon = ambilSesi(l2.token);
    cek('sesi ditolak saat akun nonaktif', sNon.berhasil === false && sNon.kode === 'SESI_HABIS');
    var b2 = cariBaris_(bacaTabel_('PENGGUNA'), 'ID_PENGGUNA', idUser);
    perbaruiBaris_('PENGGUNA', b2._baris, { STATUS_AKTIF: STATUS_AKTIF }, true);
    var sHidup = ambilSesi(l2.token);
    cek('sesi lama TIDAK hidup kembali setelah akun diaktifkan lagi', sHidup.berhasil === false && sHidup.kode === 'SESI_HABIS');
    cek('login ulang setelah diaktifkan kembali berhasil', login(username, passwordBaru).berhasil === true);

    // 4. Kelompok dan santri sementara
    var kel = simpanKelompok(tokenAdmin, { idKelompok: '', nama: 'Kelompok Uji T11 ' + stempel, idPetugas: '' });
    cek('kelompok sementara dibuat', kel.berhasil === true, kel.pesan);
    idKelompok = kel.idKelompok || '';

    var data = {
      idSantri: '', nis: 'UJIT11' + stempel, nama: 'Santri Uji Sebelas', idKelompok: idKelompok,
      namaOrangTua: 'Orang Tua Uji', nomorWa: '081200000000', tanggalMasuk: hariIni
    };
    var sa = simpanSantri(tokenAdmin, data);
    cek('santri sementara dibuat', sa.berhasil === true, sa.pesan);
    idSantri = sa.idSantri || '';

    data.idSantri = idSantri;
    data.nama = 'Santri Uji Sebelas Ubah';
    var sb = simpanSantri(tokenAdmin, data);
    cek('santri sementara diubah', sb.berhasil === true, sb.pesan);

    var sc = ubahStatusSantri(tokenAdmin, idSantri, false, hariIni);
    cek('santri sementara dinonaktifkan', sc.berhasil === true, sc.pesan);

    // 5. Periksa isi riwayat perubahan
    var log = bacaTabel_('RIWAYAT_PERUBAHAN').filter(function (r) { return r._baris > barisAwalLog; });
    function ada(tabel, aksi, idData) {
      return log.filter(function (r) {
        return String(r.TABEL).trim() === tabel && String(r.AKSI).trim() === aksi && String(r.ID_DATA).trim() === idData;
      });
    }

    var tambahUser = ada('PENGGUNA', 'TAMBAH', idUser);
    cek('riwayat: akun petugas baru tercatat (TAMBAH)', tambahUser.length === 1);
    cek('riwayat: pembuatan dari editor tercatat sebagai SISTEM',
      tambahUser.length === 1 && String(tambahUser[0].ID_PENGGUNA).trim() === 'SISTEM');

    var rs = ada('PENGGUNA', 'RESET_PASSWORD', idUser);
    cek('riwayat: reset password tercatat', rs.length === 1);
    cek('riwayat: reset password dicatat atas nama Admin yang melakukannya',
      rs.length === 1 && String(rs[0].ID_PENGGUNA).trim() === idAdmin);

    var detailPengguna = log.filter(function (r) { return String(r.TABEL).trim() === 'PENGGUNA'; })
      .map(function (r) { return String(r.DETAIL); }).join(' | ');
    cek('riwayat: tidak ada hash atau password di detail',
      detailPengguna.indexOf('v1$') < 0 && detailPengguna.indexOf(passwordLama) < 0 && detailPengguna.indexOf(passwordBaru) < 0);
    cek('riwayat: nonaktifkan dan aktifkan akun tercatat',
      ada('PENGGUNA', 'NONAKTIFKAN', idUser).length === 1 && ada('PENGGUNA', 'AKTIFKAN', idUser).length === 1);

    cek('riwayat: kelompok baru tercatat', ada('KELOMPOK', 'TAMBAH', idKelompok).length === 1);
    cek('riwayat: santri baru tercatat', ada('SANTRI', 'TAMBAH', idSantri).length === 1);
    var ubah = ada('SANTRI', 'UBAH', idSantri);
    cek('riwayat: perubahan santri mencatat nilai lama dan baru',
      ubah.length === 1 && String(ubah[0].DETAIL).indexOf("NAMA_SANTRI: 'Santri Uji Sebelas' -> 'Santri Uji Sebelas Ubah'") >= 0);
    cek('riwayat: penonaktifan santri tercatat', ada('SANTRI', 'NONAKTIFKAN', idSantri).length === 1);
  } finally {
    CacheService.getScriptCache().remove(kunciSesi_(tokenAdmin));
    hapusBarisBerdasarId_('SANTRI', 'ID_SANTRI', idSantri);
    hapusBarisBerdasarId_('KELOMPOK', 'ID_KELOMPOK', idKelompok);
    hapusBarisBerdasarId_('PENGGUNA', 'ID_PENGGUNA', idUser);
    if (idUser) { PropertiesService.getScriptProperties().deleteProperty(AWALAN_SESI_MIN + idUser); }
    KONTEKS_PENGGUNA_ = null;
  }

  hasil.forEach(function (b) { Logger.log(b); });
  Logger.log('Data sementara (akun, kelompok, santri) sudah dihapus. Baris riwayatnya dibiarkan sebagai jejak pengujian.');
  var gagal = hasil.filter(function (b) { return b.indexOf('GAGAL') === 0; }).length;
  Logger.log(gagal === 0 ? 'HASIL: SEMUA PENGUJIAN LULUS.' : 'HASIL: ' + gagal + ' PENGUJIAN GAGAL. Kirim log ini kepada saya.');
}

/* ======================== PEMERIKSA KESEHATAN DATA ======================== */

/**
 * Memeriksa kesehatan data di semua sheet. HANYA MEMBACA, tidak mengubah apa pun.
 * Jalankan sebelum aplikasi dipakai sungguhan, dan berkala sesudahnya.
 * KRITIS = harus diperbaiki. PERINGATAN = sebaiknya diperiksa.
 */
function periksaIntegritasData() {
  pastikanDijalankanPemilik_();

  var temuan = [];
  var jumlah = { KRITIS: 0, PERINGATAN: 0 };
  function lapor(tingkat, judul, daftar) {
    if (!daftar.length) { return; }
    jumlah[tingkat] += daftar.length;
    temuan.push(tingkat + ' - ' + judul + ' (' + daftar.length + '): ' +
      daftar.slice(0, 5).join('; ') + (daftar.length > 5 ? '; ...' : ''));
  }
  function teks(v) { return String(v === null || v === undefined ? '' : v).trim(); }

  var rusak = cekStrukturDatabase_().filter(function (s) { return !s.ada || !s.headerBenar; });
  if (rusak.length) {
    lapor('KRITIS', 'Struktur sheet tidak sesuai (jalankan initDatabase)', rusak.map(function (s) { return s.nama; }));
  } else {
    var pengguna = bacaTabel_('PENGGUNA').filter(function (p) { return teks(p.ID_PENGGUNA); });
    var kelompok = bacaTabel_('KELOMPOK').filter(function (k) { return teks(k.ID_KELOMPOK); });
    var santri = bacaTabel_('SANTRI').filter(function (s) { return teks(s.ID_SANTRI); });
    var pembayaran = bacaTabel_('PEMBAYARAN').filter(function (p) { return teks(p.ID_PEMBAYARAN); });
    var pembebasan = bacaTabel_('PEMBEBASAN').filter(function (r) { return teks(r.ID_PEMBEBASAN); });
    var petaKel = petaKelompok_();
    function peran(p) { return teks(p.ROLE).toUpperCase(); }

    // ---- PENGGUNA ----
    var adminAktif = pengguna.filter(function (p) { return peran(p) === ROLE_ADMIN && adalahAktif_(p.STATUS_AKTIF); });
    if (!adminAktif.length) { lapor('KRITIS', 'Tidak ada akun Admin aktif', ['(tidak ada)']); }

    var hitungUser = {};
    pengguna.forEach(function (p) { var u = teks(p.USERNAME).toLowerCase(); hitungUser[u] = (hitungUser[u] || 0) + 1; });
    lapor('KRITIS', 'Username ganda', Object.keys(hitungUser).filter(function (u) { return hitungUser[u] > 1; }));
    lapor('KRITIS', 'Password tidak tersimpan sebagai hash',
      pengguna.filter(function (p) { return teks(p.PASSWORD_HASH).indexOf('v1$') !== 0; }).map(function (p) { return teks(p.USERNAME); }));
    lapor('KRITIS', 'Role tidak dikenal',
      pengguna.filter(function (p) { return peran(p) !== ROLE_ADMIN && peran(p) !== ROLE_PETUGAS; }).map(function (p) { return teks(p.USERNAME); }));

    var petugasAktif = pengguna.filter(function (p) { return peran(p) === ROLE_PETUGAS && adalahAktif_(p.STATUS_AKTIF); });
    lapor('PERINGATAN', 'Petugas aktif tanpa kelompok (tidak bisa login)',
      petugasAktif.filter(function (p) { return !teks(p.ID_KELOMPOK); }).map(function (p) { return teks(p.USERNAME); }));
    lapor('PERINGATAN', 'Petugas aktif dengan kelompok yang tidak ada atau nonaktif',
      petugasAktif.filter(function (p) { var id = teks(p.ID_KELOMPOK); return id && (!petaKel[id] || !petaKel[id].aktif); })
        .map(function (p) { return teks(p.USERNAME); }));
    var petugasPerKel = {};
    petugasAktif.forEach(function (p) {
      var id = teks(p.ID_KELOMPOK);
      if (id) { (petugasPerKel[id] = petugasPerKel[id] || []).push(teks(p.USERNAME)); }
    });
    lapor('PERINGATAN', 'Kelompok dipegang lebih dari satu petugas aktif',
      Object.keys(petugasPerKel).filter(function (id) { return petugasPerKel[id].length > 1; })
        .map(function (id) { return (petaKel[id] ? petaKel[id].nama : id) + ' -> ' + petugasPerKel[id].join(', '); }));

    // ---- KELOMPOK ----
    var hitungNamaKel = {};
    kelompok.forEach(function (k) { var n = teks(k.NAMA_KELOMPOK).toLowerCase(); hitungNamaKel[n] = (hitungNamaKel[n] || 0) + 1; });
    lapor('PERINGATAN', 'Nama kelompok ganda', Object.keys(hitungNamaKel).filter(function (n) { return hitungNamaKel[n] > 1; }));
    var petaPengguna = {};
    pengguna.forEach(function (p) { petaPengguna[teks(p.ID_PENGGUNA)] = p; });
    lapor('PERINGATAN', 'Kelompok menunjuk petugas yang tidak ada',
      kelompok.filter(function (k) { var id = teks(k.ID_PETUGAS); return id && !petaPengguna[id]; }).map(function (k) { return teks(k.NAMA_KELOMPOK); }));

    // ---- SANTRI ----
    var petaSantri = {};
    santri.forEach(function (s) { petaSantri[teks(s.ID_SANTRI)] = s; });
    var hitungNis = {};
    santri.forEach(function (s) { var n = teks(s.NIS).toLowerCase(); hitungNis[n] = (hitungNis[n] || 0) + 1; });
    lapor('KRITIS', 'NIS ganda', Object.keys(hitungNis).filter(function (n) { return hitungNis[n] > 1; }));
    lapor('KRITIS', 'Santri dengan kelompok yang tidak ada',
      santri.filter(function (s) { return !petaKel[teks(s.ID_KELOMPOK)]; }).map(function (s) { return teks(s.NAMA_SANTRI); }));
    lapor('PERINGATAN', 'Santri aktif pada kelompok nonaktif',
      santri.filter(function (s) { var k = petaKel[teks(s.ID_KELOMPOK)]; return adalahAktif_(s.STATUS_AKTIF) && k && !k.aktif; })
        .map(function (s) { return teks(s.NAMA_SANTRI); }));
    lapor('PERINGATAN', 'Nomor WhatsApp tidak valid',
      santri.filter(function (s) { return normalisasiNomorWaAman_(s.NOMOR_WA) === ''; })
        .map(function (s) { return teks(s.NAMA_SANTRI) + ' (' + teks(s.NOMOR_WA) + ')'; }));
    lapor('PERINGATAN', 'Tanggal masuk tidak terbaca',
      santri.filter(function (s) { return indeksBulanDariTanggal_(s.TANGGAL_MASUK) === null; }).map(function (s) { return teks(s.NAMA_SANTRI); }));
    lapor('PERINGATAN', 'Santri nonaktif tanpa tanggal berhenti (tidak dihitung dalam tunggakan)',
      santri.filter(function (s) { return !adalahAktif_(s.STATUS_AKTIF) && indeksBulanDariTanggal_(s.TANGGAL_NONAKTIF) === null; })
        .map(function (s) { return teks(s.NAMA_SANTRI); }));
    lapor('PERINGATAN', 'Santri aktif tetapi memiliki tanggal berhenti',
      santri.filter(function (s) { return adalahAktif_(s.STATUS_AKTIF) && teks(s.TANGGAL_NONAKTIF) !== ''; })
        .map(function (s) { return teks(s.NAMA_SANTRI); }));

    // ---- PEMBAYARAN ----
    lapor('KRITIS', 'Pembayaran untuk santri yang tidak ada',
      pembayaran.filter(function (p) { return !petaSantri[teks(p.ID_SANTRI)]; }).map(function (p) { return teks(p.ID_PEMBAYARAN); }));
    lapor('KRITIS', 'Pembayaran dengan bulan atau tahun tidak valid',
      pembayaran.filter(function (p) { var bl = Number(p.BULAN); var th = Number(p.TAHUN); return !(bl >= 1 && bl <= 12) || !(th >= 2000); })
        .map(function (p) { return teks(p.ID_PEMBAYARAN); }));
    lapor('KRITIS', 'Pembayaran dengan nominal tidak valid',
      pembayaran.filter(function (p) { return !(Number(p.NOMINAL) > 0); }).map(function (p) { return teks(p.ID_PEMBAYARAN); }));
    lapor('PERINGATAN', 'Pembayaran dengan status tidak dikenal',
      pembayaran.filter(function (p) { var s = teks(p.STATUS_TRANSAKSI).toUpperCase(); return s !== '' && s !== STATUS_TRANSAKSI_SAH && s !== STATUS_TRANSAKSI_BATAL; })
        .map(function (p) { return teks(p.ID_PEMBAYARAN) + ' (' + teks(p.STATUS_TRANSAKSI) + ')'; }));

    var sah = pembayaran.filter(function (p) { return transaksiSah_(p); });
    var hitungKunci = {};
    sah.forEach(function (p) {
      var k = teks(p.ID_SANTRI) + '|' + Number(p.BULAN) + '|' + Number(p.TAHUN);
      hitungKunci[k] = (hitungKunci[k] || 0) + 1;
    });
    lapor('KRITIS', 'Pembayaran sah ganda untuk santri, bulan, dan tahun yang sama',
      Object.keys(hitungKunci).filter(function (k) { return hitungKunci[k] > 1; }).map(function (k) {
        var bagian = k.split('|');
        var s = petaSantri[bagian[0]];
        return (s ? teks(s.NAMA_SANTRI) : bagian[0]) + ' ' + bagian[1] + '/' + bagian[2];
      }));
    lapor('PERINGATAN', 'Pembayaran untuk bulan sebelum tanggal masuk santri',
      sah.filter(function (p) {
        var s = petaSantri[teks(p.ID_SANTRI)];
        var masuk = s ? indeksBulanDariTanggal_(s.TANGGAL_MASUK) : null;
        return masuk !== null && Number(p.TAHUN) * 12 + Number(p.BULAN) < masuk;
      }).map(function (p) { return teks(p.NAMA_SANTRI) + ' ' + Number(p.BULAN) + '/' + Number(p.TAHUN); }));

    // ---- PEMBEBASAN dan PENGATURAN ----
    lapor('PERINGATAN', 'Pembebasan dengan bulan awal tidak terbaca',
      pembebasan.filter(function (r) { return indeksBulanDariTanggal_(r.DARI) === null; }).map(function (r) { return teks(r.ID_PEMBEBASAN); }));
    lapor('PERINGATAN', 'Pembebasan untuk santri yang tidak ada',
      pembebasan.filter(function (r) { var id = teks(r.ID_SANTRI); return id && id.toUpperCase() !== 'SEMUA' && !petaSantri[id]; })
        .map(function (r) { return teks(r.ID_PEMBEBASAN); }));
    if (!bacaRiwayatNominal_().length) {
      lapor('PERINGATAN', 'Nominal infaq belum diatur (tunggakan dan pesan WhatsApp belum bisa dihitung)', ['atur di menu Pengaturan']);
    }

    Logger.log('Diperiksa: ' + pengguna.length + ' akun, ' + kelompok.length + ' kelompok, ' + santri.length +
      ' santri, ' + pembayaran.length + ' transaksi, ' + pembebasan.length + ' pembebasan.');
  }

  if (!temuan.length) {
    Logger.log('TIDAK ADA TEMUAN: struktur dan isi data konsisten.');
  } else {
    temuan.forEach(function (t) { Logger.log(t); });
  }
  Logger.log('Ringkasan: ' + jumlah.KRITIS + ' temuan KRITIS, ' + jumlah.PERINGATAN + ' PERINGATAN. (Pemeriksaan ini tidak mengubah data.)');
}