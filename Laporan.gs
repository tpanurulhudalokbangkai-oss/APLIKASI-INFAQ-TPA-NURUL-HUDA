/**
 * Laporan.gs
 * Statistik dashboard. Rekap, tunggakan, Excel, dan PDF ditambahkan pada tahap berikutnya.
 */

var NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

var STATUS_TRANSAKSI_SAH = 'SAH';
var STATUS_TRANSAKSI_BATAL = 'DIBATALKAN';

/**
 * Dipanggil dari browser. Hanya menerima token.
 * Cakupan data (seluruh TPA atau satu kelompok) ditentukan SERVER dari peran pengguna.
 */
function ambilDashboard(token) {
  try {
    var profil = wajibLogin_(token);
    return { berhasil: true, data: hitungDashboard_(profil) };
  } catch (err) {
    return galatKeRespons_(err);
  }
}

function transaksiSah_(baris) {
  return String(baris.STATUS_TRANSAKSI).trim().toUpperCase() !== STATUS_TRANSAKSI_BATAL;
}

/**
 * Mengubah tanggal (objek Date atau teks yyyy-MM-dd / dd/MM/yyyy) menjadi nomor bulan
 * (tahun x 12 + bulan) supaya mudah dibandingkan. Mengembalikan null jika tidak terbaca.
 */
function indeksBulanDariTanggal_(nilai) {
  if (nilai instanceof Date && !isNaN(nilai.getTime())) {
    var bagian = Utilities.formatDate(nilai, APP_CONFIG.ZONA_WAKTU, 'yyyy-M').split('-');
    return Number(bagian[0]) * 12 + Number(bagian[1]);
  }
  var teks = String(nilai === null || nilai === undefined ? '' : nilai).trim();
  var m = teks.match(/^(\d{4})-(\d{1,2})/);
  if (m) {
    return Number(m[1]) * 12 + Number(m[2]);
  }
  m = teks.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    return Number(m[3]) * 12 + Number(m[2]);
  }
  return null;
}

/**
 * Tanggal untuk tampilan: dd/MM/yyyy.
 */
function formatTanggal_(nilai) {
  if (nilai instanceof Date && !isNaN(nilai.getTime())) {
    return Utilities.formatDate(nilai, APP_CONFIG.ZONA_WAKTU, 'dd/MM/yyyy');
  }
  var teks = String(nilai === null || nilai === undefined ? '' : nilai).trim();
  var m = teks.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : teks;
}

function hitungDashboard_(profil) {
  var zona = APP_CONFIG.ZONA_WAKTU;
  var sekarang = new Date();
  var tahun = Number(Utilities.formatDate(sekarang, zona, 'yyyy'));
  var bulan = Number(Utilities.formatDate(sekarang, zona, 'M'));
  var adalahAdmin = profil.role === ROLE_ADMIN;

  function dalamCakupan(idKelompok) {
    return adalahAdmin || String(idKelompok).trim() === profil.idKelompok;
  }

  // Kelompok
  var namaKelompok = {};
  var jumlahKelompokAktif = 0;
  bacaTabel_('KELOMPOK').forEach(function (k) {
    var id = String(k.ID_KELOMPOK).trim();
    if (!id) { return; }
    namaKelompok[id] = String(k.NAMA_KELOMPOK).trim() || id;
    if (adalahAktif_(k.STATUS_AKTIF)) { jumlahKelompokAktif++; }
  });

  // Santri: aktif dan dalam cakupan. Santri yang tanggal masuknya setelah bulan ini
  // belum wajib membayar bulan ini.
  var santriAktif = 0;
  var santriWajib = {};
  var indeksSekarang = tahun * 12 + bulan;
  bacaTabel_('SANTRI').forEach(function (s) {
    if (!adalahAktif_(s.STATUS_AKTIF) || !dalamCakupan(s.ID_KELOMPOK)) { return; }
    var id = String(s.ID_SANTRI).trim();
    if (!id) { return; }
    santriAktif++;
    var indeksMasuk = indeksBulanDariTanggal_(s.TANGGAL_MASUK);
    if (indeksMasuk === null || indeksMasuk <= indeksSekarang) {
      santriWajib[id] = true;
    }
  });

  // Pembayaran sah dalam cakupan
  var pembayaran = bacaTabel_('PEMBAYARAN').filter(function (p) {
    return String(p.ID_PEMBAYARAN).trim() !== '' && transaksiSah_(p) && dalamCakupan(p.ID_KELOMPOK);
  });

  var perBulan = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  var penerimaanBulanIni = 0;
  var penerimaanTahunIni = 0;
  var sudahBayar = {};

  pembayaran.forEach(function (p) {
    var th = Number(p.TAHUN);
    var bl = Number(p.BULAN);
    var nominal = Number(p.NOMINAL) || 0;
    if (th === tahun && bl >= 1 && bl <= 12) {
      perBulan[bl - 1] += nominal;
      penerimaanTahunIni += nominal;
      if (bl === bulan) {
        penerimaanBulanIni += nominal;
        sudahBayar[String(p.ID_SANTRI).trim()] = true;
      }
    }
  });

  var jumlahWajib = 0;
  var jumlahSudah = 0;
  Object.keys(santriWajib).forEach(function (id) {
    jumlahWajib++;
    if (sudahBayar[id]) { jumlahSudah++; }
  });

  // Pembayaran terbaru: baris yang paling akhir dicatat
  var terbaru = pembayaran
    .slice()
    .sort(function (a, b) { return b._baris - a._baris; })
    .slice(0, 8)
    .map(function (p) {
      var idKel = String(p.ID_KELOMPOK).trim();
      var bl = Number(p.BULAN);
      var periode = (bl >= 1 && bl <= 12) ? NAMA_BULAN[bl - 1] + ' ' + String(p.TAHUN) : '';
      return {
        tanggal: formatTanggal_(p.TANGGAL_BAYAR),
        santri: String(p.NAMA_SANTRI).trim(),
        kelompok: namaKelompok[idKel] || idKel,
        periode: periode,
        nominal: Number(p.NOMINAL) || 0,
        penerima: String(p.PENERIMA).trim()
      };
    });

  return {
    cakupan: adalahAdmin ? 'Seluruh TPA' : (namaKelompok[profil.idKelompok] || profil.idKelompok),
    tahun: tahun,
    bulan: bulan,
    namaBulan: NAMA_BULAN[bulan - 1],
    santriAktif: santriAktif,
    jumlahKelompokAktif: adalahAdmin ? jumlahKelompokAktif : null,
    jumlahSantriWajib: jumlahWajib,
    sudahBayarBulanIni: jumlahSudah,
    belumBayarBulanIni: jumlahWajib - jumlahSudah,
    penerimaanBulanIni: penerimaanBulanIni,
    penerimaanTahunIni: penerimaanTahunIni,
    grafik: perBulan,
    terbaru: terbaru
  };
}