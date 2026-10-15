/**
 * Ekspor.gs
 * Ekspor Excel dan cetak PDF (KHUSUS ADMIN).
 *
 * Cara kerja:
 * 1. Server memeriksa sesi dan peran Admin.
 * 2. Data dihitung memakai mesin rekap yang sama dengan tampilan di aplikasi.
 * 3. Data ditulis ke spreadsheet SEMENTARA dengan tata letak laporan.
 * 4. Spreadsheet sementara diekspor menjadi XLSX atau PDF.
 * 5. Spreadsheet sementara dibuang ke Sampah, lalu berkas dikirim ke browser.
 */

var MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
var MIME_PDF = 'application/pdf';

var JENIS_LAPORAN = {
  PEMBAYARAN: ['XLSX', 'PDF'],
  TUNGGAKAN: ['XLSX', 'PDF'],
  TAHUNAN: ['PDF']
};

var WARNA_LAPORAN = {
  hijau: '#0B4D3A',
  hijauMuda: '#E7F3EE',
  merahMuda: '#FDECEA',
  merah: '#B3261E',
  emasMuda: '#FAF3D9',
  emasTua: '#8A6D0B',
  abuMuda: '#F3F7F5',
  abuTeks: '#5B6B65',
  abuSel: '#9AA7A1',
  garis: '#C9D6D0',
  zebra: '#F8FBF9',
  teks: '#1F2D28'
};

var SINGKAT_BULAN_LAPORAN = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];

/* ======================== PEMBANTU TEKS ======================== */

function labelZona_() {
  var z = APP_CONFIG.ZONA_WAKTU;
  if (z === 'Asia/Jakarta') { return 'WIB'; }
  if (z === 'Asia/Makassar') { return 'WITA'; }
  if (z === 'Asia/Jayapura') { return 'WIT'; }
  return z;
}

/**
 * Contoh hasil: 13 Oktober 2026, 14:35 WITA
 */
function teksWaktuBuat_() {
  var s = new Date();
  var zona = APP_CONFIG.ZONA_WAKTU;
  var hari = Utilities.formatDate(s, zona, 'd');
  var bulan = Number(Utilities.formatDate(s, zona, 'M'));
  var tahun = Utilities.formatDate(s, zona, 'yyyy');
  var jam = Utilities.formatDate(s, zona, 'HH:mm');
  return hari + ' ' + NAMA_BULAN[bulan - 1] + ' ' + tahun + ', ' + jam + ' ' + labelZona_();
}

function namaKelompokUntuk_(idKelompok) {
  if (!idKelompok) { return 'Semua kelompok'; }
  var k = petaKelompok_()[idKelompok];
  return k ? k.nama : idKelompok;
}

/**
 * Meringkas daftar bulan: "Maret, April 2026; Januari 2027"
 */
function ringkasBulanServer_(daftar) {
  if (!daftar.length) { return 'Lunas'; }
  var perTahun = {};
  var urutan = [];
  daftar.forEach(function (b) {
    if (!perTahun[b.tahun]) { perTahun[b.tahun] = []; urutan.push(b.tahun); }
    perTahun[b.tahun].push(NAMA_BULAN[b.bulan - 1]);
  });
  return urutan.map(function (t) { return perTahun[t].join(', ') + ' ' + t; }).join('; ');
}

/* ======================== PENYUSUN ISI LAPORAN ======================== */
/*
 * Setiap penyusun menghasilkan "spec":
 * judul, periode, info[], kolom[{judul, lebar, jenis, bungkus}], baris[][],
 * totalBaris[{label, rentangLabel, sel:{indeksKolom: nilai}, format:{indeksKolom: pola}}],
 * catatan[], orientasi, ukuranFont, kodeFile, periksa{kolom, nilai}, gayaSel(i, j)
 *
 * jenis kolom: no, angka, teks, tengah, rupiah, angkaRibuan
 */

function susunSpecPembayaran_(profil, filterMentah) {
  var f = normalisasiFilterRekap_(profil, filterMentah, false);
  var d = hitungRekapPembayaran_(profil, f);

  var periode;
  if (f.bulan !== 0 && f.tahun !== 0) { periode = NAMA_BULAN[f.bulan - 1] + ' ' + f.tahun; }
  else if (f.bulan !== 0) { periode = 'Bulan ' + NAMA_BULAN[f.bulan - 1] + ' (semua tahun)'; }
  else if (f.tahun !== 0) { periode = 'Tahun ' + f.tahun; }
  else { periode = 'Semua periode'; }

  var info = ['Kelompok: ' + namaKelompokUntuk_(f.idKelompok)];
  if (f.kata) { info.push('Pencarian nama atau NIS: "' + f.kata + '"'); }

  var baris = d.baris.map(function (r, i) {
    return [i + 1, r.nis, r.nama, r.namaKelompok, NAMA_BULAN[r.bulan - 1] || '', r.tahun,
      formatTanggal_(r.tanggal), r.nominal, r.penerima];
  });

  return {
    judul: f.bulan !== 0 ? 'LAPORAN PEMBAYARAN INFAQ BULANAN' : 'LAPORAN PEMBAYARAN INFAQ',
    periode: periode,
    info: info,
    kolom: [
      { judul: 'No', lebar: 36, jenis: 'no' },
      { judul: 'NIS', lebar: 80, jenis: 'teks' },
      { judul: 'Nama Santri', lebar: 190, jenis: 'teks' },
      { judul: 'Kelompok', lebar: 110, jenis: 'teks' },
      { judul: 'Bulan', lebar: 90, jenis: 'tengah' },
      { judul: 'Tahun', lebar: 55, jenis: 'angka' },
      { judul: 'Tanggal Bayar', lebar: 95, jenis: 'tengah' },
      { judul: 'Nominal', lebar: 100, jenis: 'rupiah' },
      { judul: 'Penerima', lebar: 140, jenis: 'teks' }
    ],
    baris: baris,
    totalBaris: [{ label: 'TOTAL PENERIMAAN (' + d.jumlah + ' transaksi)', rentangLabel: 7, sel: { 7: d.total } }],
    catatan: ['Hanya transaksi yang sah. Transaksi yang dibatalkan tidak disertakan.'],
    orientasi: 'portrait',
    ukuranFont: 10,
    kodeFile: 'Pembayaran',
    periksa: { kolom: 7, nilai: d.total }
  };
}

function susunSpecTunggakan_(profil, filterMentah) {
  var f = normalisasiFilterRekap_(profil, filterMentah, true);
  var d = hitungTunggakan_(profil, f);
  if (d.tanpaNominal) {
    throw buatGalat_('DATA_TIDAK_VALID', 'Nominal infaq belum diatur. Atur nominal di menu Pengaturan sebelum membuat laporan tunggakan.');
  }

  var labelStatus = f.status === 'AKTIF' ? 'Santri aktif' : (f.status === 'NONAKTIF' ? 'Santri nonaktif' : 'Semua santri');
  var info = ['Kelompok: ' + namaKelompokUntuk_(f.idKelompok) + '   |   ' + labelStatus];
  if (f.hanyaMenunggak) { info.push('Hanya santri yang menunggak'); }
  if (f.kata) { info.push('Pencarian nama atau NIS: "' + f.kata + '"'); }

  var totalBulan = 0;
  var totalRupiah = 0;
  var jumlahMenunggak = 0;
  var baris = d.baris.map(function (r, i) {
    totalBulan += r.jumlah;
    totalRupiah += r.total;
    if (r.jumlah > 0) { jumlahMenunggak++; }
    return [i + 1, r.nis, r.nama + (r.aktif ? '' : ' (nonaktif)'), r.namaKelompok,
      ringkasBulanServer_(r.bulanTertunggak), r.jumlah, r.total];
  });

  var catatan = [
    'Penagihan dimulai dari ' + NAMA_BULAN[d.awalPenagihan.bulan - 1] + ' ' + d.awalPenagihan.tahun +
      '. Bulan sebelum tanggal masuk, sesudah berhenti, dan yang dibebaskan tidak dihitung.',
    'Nominal tiap bulan mengikuti nominal yang berlaku pada bulan itu. Transaksi yang dibatalkan tidak dianggap pembayaran.'
  ];
  if (d.tanpaTanggalBerhenti > 0) {
    catatan.push(d.tanpaTanggalBerhenti + ' santri nonaktif tanpa tanggal berhenti tidak dihitung dalam laporan ini.');
  }

  return {
    judul: 'LAPORAN TUNGGAKAN INFAQ',
    periode: 'Dihitung sampai ' + NAMA_BULAN[f.bulan - 1] + ' ' + f.tahun,
    info: info,
    kolom: [
      { judul: 'No', lebar: 36, jenis: 'no' },
      { judul: 'NIS', lebar: 80, jenis: 'teks' },
      { judul: 'Nama Santri', lebar: 190, jenis: 'teks' },
      { judul: 'Kelompok', lebar: 110, jenis: 'teks' },
      { judul: 'Bulan Belum Dibayar', lebar: 330, jenis: 'teks', bungkus: true },
      { judul: 'Jumlah Bulan', lebar: 70, jenis: 'angka' },
      { judul: 'Total Tunggakan', lebar: 115, jenis: 'rupiah' }
    ],
    baris: baris,
    totalBaris: [{ label: 'TOTAL TUNGGAKAN (' + jumlahMenunggak + ' santri menunggak)', rentangLabel: 5, sel: { 5: totalBulan, 6: totalRupiah } }],
    catatan: catatan,
    orientasi: 'landscape',
    ukuranFont: 10,
    kodeFile: 'Tunggakan',
    periksa: { kolom: 6, nilai: totalRupiah }
  };
}

function susunSpecTahunan_(profil, filterMentah) {
  var f = normalisasiFilterTahunan_(filterMentah);
  var d = hitungRekapTahunan_(f);

  var KODE = { LUNAS: 'L', BELUM_BAYAR: 'X', BEBAS: 'B', TIDAK_DITAGIH: '-', BELUM_JATUH_TEMPO: '.' };

  var kolom = [
    { judul: 'No', lebar: 34, jenis: 'no' },
    { judul: 'NIS', lebar: 70, jenis: 'teks' },
    { judul: 'Nama Santri', lebar: 170, jenis: 'teks' },
    { judul: 'Kelompok', lebar: 100, jenis: 'teks' }
  ];
  SINGKAT_BULAN_LAPORAN.forEach(function (b) { kolom.push({ judul: b, lebar: 46, jenis: 'tengah' }); });
  kolom.push({ judul: 'Total Bayar', lebar: 92, jenis: 'rupiah' });
  kolom.push({ judul: 'Total Tunggakan', lebar: 96, jenis: 'rupiah' });

  var baris = d.baris.map(function (r, i) {
    var sel = [i + 1, r.nis, r.nama + (r.aktif ? '' : ' (nonaktif)'), r.namaKelompok];
    r.status.forEach(function (s) { sel.push(KODE[s]); });
    sel.push(r.totalBayar);
    sel.push(r.totalTunggakan);
    return sel;
  });

  var selTotal = {};
  var formatTotal = {};
  d.totalPerBulan.forEach(function (n, i) { selTotal[4 + i] = n; formatTotal[4 + i] = '#,##0'; });
  selTotal[16] = d.totalTahunan;
  selTotal[17] = d.totalTunggakan;

  var catatan = [
    'Keterangan: L = Lunas, X = Belum dibayar, B = Bebas (dibebaskan), - = Tidak ditagih, . = Belum jatuh tempo.',
    'Total tunggakan dihitung untuk bulan pada tahun ' + d.tahun + ' yang sudah jatuh tempo, memakai nominal yang berlaku tiap bulan.'
  ];
  if (d.awalPenagihan) {
    catatan.push('Penagihan dimulai dari ' + NAMA_BULAN[d.awalPenagihan.bulan - 1] + ' ' + d.awalPenagihan.tahun + '.');
  }
  if (d.tanpaTanggalBerhenti > 0) {
    catatan.push(d.tanpaTanggalBerhenti + ' santri nonaktif tanpa tanggal berhenti: hanya pembayarannya yang ditampilkan.');
  }

  return {
    judul: 'REKAP PEMBAYARAN INFAQ TAHUNAN SELURUH SANTRI',
    periode: 'Tahun ' + d.tahun + ' (Januari sampai Desember)',
    info: ['Kelompok: ' + namaKelompokUntuk_(f.idKelompok)],
    kolom: kolom,
    baris: baris,
    totalBaris: [{ label: 'TOTAL PENERIMAAN PER BULAN', rentangLabel: 4, sel: selTotal, format: formatTotal }],
    catatan: catatan,
    orientasi: 'landscape',
    ukuranFont: 9,
    kodeFile: 'Rekap_Tahunan',
    periksa: { kolom: 16, nilai: d.totalTahunan },
    gayaSel: function (i, j) {
      if (j < 4 || j > 15) { return null; }
      var s = d.baris[i].status[j - 4];
      if (s === 'LUNAS') { return { latar: WARNA_LAPORAN.hijauMuda, teks: WARNA_LAPORAN.hijau, tebal: true }; }
      if (s === 'BELUM_BAYAR') { return { latar: WARNA_LAPORAN.merahMuda, teks: WARNA_LAPORAN.merah, tebal: true }; }
      if (s === 'BEBAS') { return { latar: WARNA_LAPORAN.emasMuda, teks: WARNA_LAPORAN.emasTua, tebal: true }; }
      return { latar: '#F7F9F8', teks: WARNA_LAPORAN.abuSel, tebal: false };
    }
  };
}

/* ======================== PEMBANGUN SPREADSHEET SEMENTARA ======================== */

function formatKolom_(k) {
  switch (k.jenis) {
    case 'no':
    case 'angka':
      return '0';
    case 'rupiah':
      return '"Rp"#,##0';
    case 'angkaRibuan':
      return '#,##0';
    default:
      return '@';
  }
}

function rataKolom_(k) {
  if (k.jenis === 'rupiah') { return 'right'; }
  if (k.jenis === 'no' || k.jenis === 'angka' || k.jenis === 'tengah') { return 'center'; }
  return 'left';
}

function buangSheetSementara_(ss) {
  try {
    DriveApp.getFileById(ss.getId()).setTrashed(true);
  } catch (err) {
    console.error('Spreadsheet sementara tidak dapat dibuang: ' + (err && err.message ? err.message : err));
  }
}

/**
 * Menulis spec ke spreadsheet sementara dengan tata letak laporan.
 * untukPdf = true: baris judul dan header dibekukan agar berulang di setiap halaman PDF.
 */
function bangunSheetLaporan_(spec, profil, untukPdf) {
  var ss = SpreadsheetApp.create('TMP_LAPORAN_' + Utilities.getUuid().substring(0, 8));
  try {
    try { ss.setSpreadsheetLocale('id_ID'); } catch (e) { console.warn('Locale tidak dapat diatur: ' + e.message); }
    ss.setSpreadsheetTimeZone(APP_CONFIG.ZONA_WAKTU);

    var sheet = ss.getSheets()[0];
    sheet.setName('Laporan');

    var jml = spec.kolom.length;
    var info = spec.info || [];
    var totalBaris = spec.totalBaris || [];
    var catatan = spec.catatan || [];
    var n = spec.baris.length;
    var ukuranFont = spec.ukuranFont || 10;

    // Pastikan jumlah kolom dan baris cukup, dan buang kolom berlebih
    if (sheet.getMaxColumns() > jml) {
      sheet.deleteColumns(jml + 1, sheet.getMaxColumns() - jml);
    } else if (sheet.getMaxColumns() < jml) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), jml - sheet.getMaxColumns());
    }
    var butuhBaris = 3 + info.length + 2 + 1 + Math.max(n, 1) + totalBaris.length + (catatan.length ? catatan.length + 1 : 0) + 1;
    if (sheet.getMaxRows() < butuhBaris) {
      sheet.insertRowsAfter(sheet.getMaxRows(), butuhBaris - sheet.getMaxRows());
    }

    var baris = 1;

    function barisTeks(teks, ukuran, tebal, warna, miring, tinggi) {
      var r = sheet.getRange(baris, 1, 1, jml);
      r.merge();
      r.setValue(teks)
        .setFontSize(ukuran)
        .setFontWeight(tebal ? 'bold' : 'normal')
        .setFontColor(warna)
        .setFontStyle(miring ? 'italic' : 'normal')
        .setHorizontalAlignment('center')
        .setVerticalAlignment('middle');
      sheet.setRowHeight(baris, tinggi);
      baris++;
    }

    // Blok judul
    barisTeks(String(APP_CONFIG.NAMA_TPA).toUpperCase(), 16, true, WARNA_LAPORAN.hijau, false, 30);
    barisTeks(spec.judul, 13, true, WARNA_LAPORAN.teks, false, 24);
    barisTeks('Periode: ' + spec.periode, 11, false, WARNA_LAPORAN.teks, false, 20);
    info.forEach(function (teks) { barisTeks(teks, 10, false, WARNA_LAPORAN.abuTeks, false, 18); });
    barisTeks('Dibuat pada ' + teksWaktuBuat_() + ' oleh ' + profil.nama, 9, false, WARNA_LAPORAN.abuTeks, true, 18);
    sheet.setRowHeight(baris, 8);
    baris++;

    // Header tabel
    var barisHeader = baris;
    var rHeader = sheet.getRange(barisHeader, 1, 1, jml);
    rHeader.setNumberFormat('@');
    rHeader.setValues([spec.kolom.map(function (k) { return k.judul; })]);
    rHeader.setBackground(WARNA_LAPORAN.hijau)
      .setFontColor('#FFFFFF')
      .setFontWeight('bold')
      .setFontSize(ukuranFont)
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setWrap(true);
    sheet.setRowHeight(barisHeader, 34);

    // Isi tabel
    var awalData = barisHeader + 1;
    if (n > 0) {
      spec.kolom.forEach(function (k, j) {
        var rKol = sheet.getRange(awalData, j + 1, n, 1);
        rKol.setNumberFormat(formatKolom_(k));
        rKol.setHorizontalAlignment(rataKolom_(k));
        if (k.bungkus) { rKol.setWrap(true); }
      });

      var rData = sheet.getRange(awalData, 1, n, jml);
      rData.setValues(spec.baris);
      rData.setFontSize(ukuranFont).setVerticalAlignment('middle');

      var latar = [];
      var warnaTeks = [];
      var tebal = [];
      for (var i = 0; i < n; i++) {
        var rl = [];
        var rt = [];
        var rb = [];
        for (var j = 0; j < jml; j++) {
          var gaya = spec.gayaSel ? spec.gayaSel(i, j) : null;
          rl.push(gaya ? gaya.latar : (i % 2 === 1 ? WARNA_LAPORAN.zebra : '#FFFFFF'));
          rt.push(gaya ? gaya.teks : WARNA_LAPORAN.teks);
          rb.push(gaya && gaya.tebal ? 'bold' : 'normal');
        }
        latar.push(rl);
        warnaTeks.push(rt);
        tebal.push(rb);
      }
      rData.setBackgrounds(latar).setFontColors(warnaTeks).setFontWeights(tebal);

      try { sheet.autoResizeRows(awalData, n); } catch (e) { /* abaikan */ }
    } else {
      var rKosong = sheet.getRange(awalData, 1, 1, jml);
      rKosong.merge();
      rKosong.setValue('Tidak ada data untuk filter ini.')
        .setHorizontalAlignment('center')
        .setFontStyle('italic')
        .setFontColor(WARNA_LAPORAN.abuTeks)
        .setFontSize(ukuranFont);
    }

    // Baris total
    var posTotal = awalData + Math.max(n, 1);
    totalBaris.forEach(function (tb, t) {
      var r = posTotal + t;
      var rLabel = sheet.getRange(r, 1, 1, tb.rentangLabel);
      rLabel.merge();
      rLabel.setValue(tb.label).setHorizontalAlignment('left');

      Object.keys(tb.sel).forEach(function (kunci) {
        var idx = Number(kunci);
        var kol = spec.kolom[idx];
        var pola = (tb.format && tb.format[kunci]) || (formatKolom_(kol) === '@' ? '#,##0' : formatKolom_(kol));
        var sel = sheet.getRange(r, idx + 1);
        sel.setNumberFormat(pola);
        sel.setValue(tb.sel[kunci]);
        sel.setHorizontalAlignment(kol.jenis === 'tengah' ? 'center' : rataKolom_(kol));
      });

      sheet.getRange(r, 1, 1, jml)
        .setFontWeight('bold')
        .setFontSize(ukuranFont)
        .setBackground(WARNA_LAPORAN.abuMuda)
        .setVerticalAlignment('middle');
      sheet.setRowHeight(r, 24);
    });

    // Garis tabel
    var akhirTabel = posTotal + Math.max(totalBaris.length, 1) - 1;
    sheet.getRange(barisHeader, 1, akhirTabel - barisHeader + 1, jml)
      .setBorder(true, true, true, true, true, true, WARNA_LAPORAN.garis, SpreadsheetApp.BorderStyle.SOLID);

    // Catatan kaki
    baris = posTotal + totalBaris.length;
    if (catatan.length) {
      sheet.setRowHeight(baris, 8);
      baris++;
      catatan.forEach(function (teks) {
        var r = sheet.getRange(baris, 1, 1, jml);
        r.merge();
        r.setValue(teks)
          .setFontSize(9)
          .setFontStyle('italic')
          .setFontColor(WARNA_LAPORAN.abuTeks)
          .setHorizontalAlignment('left')
          .setVerticalAlignment('middle');
        sheet.setRowHeight(baris, 18);
        baris++;
      });
    }

    // Lebar kolom
    spec.kolom.forEach(function (k, j) { sheet.setColumnWidth(j + 1, k.lebar); });

    // Buang baris kosong berlebih
    var barisTerakhir = baris - 1;
    if (sheet.getMaxRows() > barisTerakhir) {
      sheet.deleteRows(barisTerakhir + 1, sheet.getMaxRows() - barisTerakhir);
    }

    if (untukPdf) { sheet.setFrozenRows(barisHeader); }

    SpreadsheetApp.flush();
    return { ss: ss, sheet: sheet, awalData: awalData, posTotal: posTotal, barisHeader: barisHeader };
  } catch (err) {
    buangSheetSementara_(ss);
    throw err;
  }
}

/* ======================== EKSPOR BERKAS ======================== */

function berkasValid_(bytes, format) {
  if (!bytes || bytes.length < 100) { return false; }
  if (format === 'XLSX') { return bytes[0] === 0x50 && bytes[1] === 0x4B; }               // "PK"
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;  // "%PDF"
}

function eksporSheet_(ss, format, spec) {
  var id = ss.getId();
  var gid = ss.getSheets()[0].getSheetId();
  var url;

  if (format === 'XLSX') {
    url = 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=xlsx';
  } else {
    url = 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=pdf' +
      '&size=A4' +
      '&portrait=' + (spec.orientasi === 'landscape' ? 'false' : 'true') +
      '&fitw=true&scale=2' +
      '&gridlines=false&printnotes=false&printtitle=false&sheetnames=false' +
      '&pagenum=CENTER&fzr=true' +
      '&horizontal_alignment=CENTER' +
      '&top_margin=0.5&bottom_margin=0.6&left_margin=0.4&right_margin=0.4' +
      '&gid=' + gid;
  }

  var res = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  var kode = res.getResponseCode();
  if (kode === 401 || kode === 403) {
    throw buatGalat_('IZIN_EKSPOR', 'Izin Google untuk ekspor belum diberikan. Pemilik aplikasi perlu menjalankan fungsi ujiEkspor dari editor Apps Script satu kali.');
  }
  if (kode !== 200) {
    console.error('Ekspor gagal, kode ' + kode + ': ' + res.getContentText().substring(0, 300));
    throw buatGalat_('EKSPOR_GAGAL', 'Pembuatan file gagal (kode ' + kode + '). Silakan coba lagi beberapa saat lagi.');
  }

  var bytes = res.getBlob().getBytes();
  if (!berkasValid_(bytes, format)) {
    throw buatGalat_('EKSPOR_GAGAL', 'Google tidak mengembalikan berkas ' + format + ' yang valid. Silakan coba lagi.');
  }
  return bytes;
}

/**
 * Membuat satu berkas laporan. sebelumEkspor (opsional) dipanggil sebelum ekspor
 * untuk memeriksa isi spreadsheet sementara (dipakai uji otomatis).
 */
function buatBerkas_(profil, jenis, format, filterMentah, sebelumEkspor) {
  var spec;
  if (jenis === 'PEMBAYARAN') { spec = susunSpecPembayaran_(profil, filterMentah); }
  else if (jenis === 'TUNGGAKAN') { spec = susunSpecTunggakan_(profil, filterMentah); }
  else { spec = susunSpecTahunan_(profil, filterMentah); }

  var b = bangunSheetLaporan_(spec, profil, format === 'PDF');
  try {
    if (sebelumEkspor) { sebelumEkspor(b, spec); }
    var bytes = eksporSheet_(b.ss, format, spec);
    var stempel = Utilities.formatDate(new Date(), APP_CONFIG.ZONA_WAKTU, 'yyyyMMdd-HHmm');
    var namaFile = 'Laporan_' + spec.kodeFile + '_TPA_Nurul_Huda_' + stempel + (format === 'XLSX' ? '.xlsx' : '.pdf');
    return {
      namaFile: namaFile,
      mime: format === 'XLSX' ? MIME_XLSX : MIME_PDF,
      bytes: bytes,
      spec: spec,
      jumlahBaris: spec.baris.length
    };
  } finally {
    buangSheetSementara_(b.ss);
  }
}

/* ======================== FUNGSI PUBLIK (KHUSUS ADMIN) ======================== */

/**
 * permintaan: { jenis: 'PEMBAYARAN'|'TUNGGAKAN'|'TAHUNAN', format: 'XLSX'|'PDF', filter: {...} }
 * Petugas ditolak (DILARANG) oleh server.
 */
function buatLaporan(token, permintaan) {
  try {
    var profil = wajibLogin_(token);
    wajibAdmin_(profil);

    if (!permintaan || typeof permintaan !== 'object') {
      throw buatGalat_('DATA_TIDAK_VALID', 'Permintaan laporan tidak lengkap.');
    }
    var jenis = String(permintaan.jenis || '').toUpperCase();
    var format = String(permintaan.format || '').toUpperCase();
    if (!JENIS_LAPORAN[jenis] || JENIS_LAPORAN[jenis].indexOf(format) < 0) {
      throw buatGalat_('DATA_TIDAK_VALID', 'Jenis atau format laporan tidak dikenal.');
    }

    var hasil = buatBerkas_(profil, jenis, format, permintaan.filter, null);

    catatRiwayatAman_(profil, 'LAPORAN', jenis, 'EKSPOR_' + format,
      hasil.spec.judul + ' | ' + hasil.spec.periode + ' | ' + hasil.spec.info.join(' | ') + ' | ' + hasil.jumlahBaris + ' baris');

    return {
      berhasil: true,
      data: {
        namaFile: hasil.namaFile,
        mime: hasil.mime,
        base64: Utilities.base64Encode(hasil.bytes),
        ukuran: hasil.bytes.length,
        jumlahBaris: hasil.jumlahBaris,
        judul: hasil.spec.judul
      }
    };
  } catch (err) {
    if (err && !err.kode && /authoriz|permission|otorisasi|izin|scope/i.test(String(err.message))) {
      console.error(err);
      return {
        berhasil: false,
        kode: 'IZIN_EKSPOR',
        pesan: 'Izin Google untuk ekspor belum diberikan. Pemilik aplikasi perlu menjalankan fungsi ujiEkspor dari editor Apps Script satu kali.'
      };
    }
    return galatKeRespons_(err);
  }
}

/* ======================== UJI OTOMATIS ======================== */

/**
 * Menjalankan SEMUA jenis laporan terhadap data nyata (hanya membaca data):
 * membuat spreadsheet sementara, memeriksa isinya, mengekspor, memeriksa berkas, lalu membuangnya.
 * Menjalankan fungsi ini sekaligus MEMBERI IZIN Drive dan permintaan eksternal yang dibutuhkan.
 * Dijalankan manual dari editor.
 */
function ujiEkspor() {
  pastikanDijalankanPemilik_();

  var profil = { role: ROLE_ADMIN, idKelompok: '', idPengguna: 'UJI-OTOMATIS', nama: 'Uji Otomatis' };
  var sekarang = waktuSekarang_();
  var filter = {
    PEMBAYARAN: { tahun: sekarang.tahun, bulan: 0, idKelompok: '', kata: '' },
    TUNGGAKAN: { tahun: sekarang.tahun, bulan: sekarang.bulan, idKelompok: '', status: 'SEMUA', hanyaMenunggak: true },
    TAHUNAN: { tahun: sekarang.tahun, idKelompok: '' }
  };
  var kombinasi = [
    ['PEMBAYARAN', 'XLSX'], ['PEMBAYARAN', 'PDF'],
    ['TUNGGAKAN', 'XLSX'], ['TUNGGAKAN', 'PDF'],
    ['TAHUNAN', 'PDF']
  ];
  var hasil = [];

  kombinasi.forEach(function (k) {
    var nama = k[0] + ' ' + k[1];
    var catatanIsi = '';
    try {
      var b = buatBerkas_(profil, k[0], k[1], filter[k[0]], function (bangun, spec) {
        var n = spec.baris.length;
        var cocok = true;
        if (n > 0) {
          var kolomNo = bangun.sheet.getRange(bangun.awalData, 1, n, 1).getValues();
          cocok = Number(kolomNo[n - 1][0]) === n;
        }
        var nilaiTotal = bangun.sheet.getRange(bangun.posTotal, spec.periksa.kolom + 1).getValue();
        cocok = cocok && Number(nilaiTotal) === spec.periksa.nilai;
        catatanIsi = n + ' baris data, total di sheet ' + nilaiTotal + ' (harapan ' + spec.periksa.nilai + ')';
        if (!cocok) {
          throw new Error('Isi spreadsheet sementara tidak cocok dengan data: ' + catatanIsi);
        }
      });
      var lulus = b.bytes.length > 500;
      hasil.push((lulus ? 'LULUS' : 'GAGAL') + ' - ' + nama + ' -> ' + b.namaFile +
        ' (' + Math.max(1, Math.round(b.bytes.length / 1024)) + ' KB; ' + catatanIsi + ')');
    } catch (err) {
      var pesan = String(err && err.message ? err.message : err);
      if (err && err.kode === 'DATA_TIDAK_VALID') {
        hasil.push('LEWATI - ' + nama + ' -> ' + pesan);
      } else {
        hasil.push('GAGAL - ' + nama + ' -> ' + pesan);
      }
    }
  });

  hasil.forEach(function (b) { Logger.log(b); });
  var gagal = hasil.filter(function (b) { return b.indexOf('GAGAL') === 0; }).length;
  Logger.log(gagal === 0 ? 'HASIL: SEMUA PENGUJIAN LULUS.' : 'HASIL: ' + gagal + ' PENGUJIAN GAGAL. Kirim log ini kepada saya.');
}

/**
 * Membuktikan Petugas DITOLAK untuk semua laporan dan format, termasuk lewat pemanggilan langsung.
 * Butuh akun petugas_uji yang punya kelompok. Tidak membuat berkas apa pun.
 */
function ujiHakAksesTahap9() {
  pastikanDijalankanPemilik_();

  var petugas = cariPenggunaByUsername_('petugas_uji');
  if (!petugas || String(petugas.ROLE).trim().toUpperCase() !== ROLE_PETUGAS) {
    throw new Error('Akun petugas dengan username petugas_uji belum ada. Buat dulu lewat menu Data Petugas.');
  }
  if (!String(petugas.ID_KELOMPOK).trim()) {
    throw new Error('Akun petugas_uji belum memiliki kelompok.');
  }

  var token = buatSesi_(String(petugas.ID_PENGGUNA).trim());
  var hasil = [];

  try {
    [['PEMBAYARAN', 'XLSX'], ['PEMBAYARAN', 'PDF'], ['TUNGGAKAN', 'XLSX'], ['TUNGGAKAN', 'PDF'], ['TAHUNAN', 'PDF']].forEach(function (k) {
      var r = buatLaporan(token, { jenis: k[0], format: k[1], filter: {} });
      var lulus = r && r.berhasil === false && r.kode === 'DILARANG';
      hasil.push((lulus ? 'LULUS' : 'GAGAL') + ' - buatLaporan ' + k[0] + ' ' + k[1] + ' oleh Petugas -> ' +
        (r.berhasil ? 'DITERIMA (seharusnya ditolak)' : r.kode));
    });

    var palsu = buatLaporan('abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH', { jenis: 'PEMBAYARAN', format: 'XLSX', filter: {} });
    hasil.push((palsu.berhasil === false && palsu.kode === 'SESI_HABIS' ? 'LULUS' : 'GAGAL') +
      ' - buatLaporan dengan token palsu -> ' + (palsu.berhasil ? 'DITERIMA' : palsu.kode));
  } finally {
    CacheService.getScriptCache().remove(kunciSesi_(token));
  }

  hasil.forEach(function (b) { Logger.log(b); });
  var gagal = hasil.filter(function (b) { return b.indexOf('GAGAL') === 0; }).length;
  Logger.log(gagal === 0 ? 'HASIL: SEMUA PENGUJIAN LULUS.' : 'HASIL: ' + gagal + ' PENGUJIAN GAGAL. Kirim log ini kepada saya.');
}