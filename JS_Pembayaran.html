/**
 * Pengaturan.gs
 * Pengaturan aplikasi. Saat ini: nominal infaq bulanan.
 *
 * Nominal disimpan sebagai riwayat per periode di sheet PENGATURAN:
 *   KUNCI = NOMINAL_INFAQ_yyyy-MM   NILAI = nominal
 * Artinya nominal itu berlaku mulai bulan tersebut dan seterusnya,
 * sampai ada periode yang lebih baru.
 */

var AWALAN_NOMINAL = 'NOMINAL_INFAQ_';

/**
 * Membaca seluruh riwayat nominal, diurutkan dari periode terlama.
 */
function bacaRiwayatNominal_() {
  var hasil = [];
  bacaTabel_('PENGATURAN').forEach(function (r) {
    var m = String(r.KUNCI).trim().match(/^NOMINAL_INFAQ_(\d{4})-(\d{2})$/);
    if (!m) { return; }
    var nilai = Number(r.NILAI);
    if (!(nilai > 0)) { return; }
    hasil.push({ tahun: Number(m[1]), bulan: Number(m[2]), nominal: nilai });
  });
  hasil.sort(function (a, b) { return (a.tahun * 12 + a.bulan) - (b.tahun * 12 + b.bulan); });
  return hasil;
}

/**
 * Nominal yang berlaku pada suatu bulan: periode terbaru yang tidak melewati bulan itu.
 * Mengembalikan 0 jika belum ada nominal yang diatur.
 */
function nominalBerlaku_(riwayat, bulan, tahun) {
  var target = tahun * 12 + bulan;
  var terbaik = -1;
  var hasil = 0;
  riwayat.forEach(function (r) {
    var idx = r.tahun * 12 + r.bulan;
    if (idx <= target && idx > terbaik) {
      terbaik = idx;
      hasil = r.nominal;
    }
  });
  return hasil;
}

/**
 * Boleh dibaca semua pengguna yang login (dipakai untuk mengisi nominal di form pembayaran).
 */
function ambilNominalInfaq(token) {
  try {
    wajibLogin_(token);
    var zona = APP_CONFIG.ZONA_WAKTU;
    var tahun = Number(Utilities.formatDate(new Date(), zona, 'yyyy'));
    var bulan = Number(Utilities.formatDate(new Date(), zona, 'M'));
    var riwayat = bacaRiwayatNominal_();
    return {
      berhasil: true,
      data: {
        riwayat: riwayat,
        nominalSaatIni: nominalBerlaku_(riwayat, bulan, tahun),
        bulan: bulan,
        tahun: tahun
      }
    };
  } catch (err) {
    return galatKeRespons_(err);
  }
}

/**
 * Menambah atau mengubah nominal untuk satu periode (khusus Admin).
 */
function simpanNominalInfaq(token, data) {
  try {
    var profil = wajibLogin_(token);
    wajibAdmin_(profil);

    if (!data || typeof data !== 'object') {
      throw buatGalat_('DATA_TIDAK_VALID', 'Data tidak lengkap.');
    }
    var tahunIni = Number(Utilities.formatDate(new Date(), APP_CONFIG.ZONA_WAKTU, 'yyyy'));
    var nominal = keBilanganBulat_(data.nominal, 'Nominal infaq', 1000, 10000000);
    var bulan = keBilanganBulat_(data.bulan, 'Bulan', 1, 12);
    var tahun = keBilanganBulat_(data.tahun, 'Tahun', 2000, tahunIni + 2);

    var kunciData = AWALAN_NOMINAL + tahun + '-' + ('0' + bulan).slice(-2);
    var keterangan = 'Nominal infaq per bulan, berlaku mulai ' + NAMA_BULAN[bulan - 1] + ' ' + tahun;

    return dalamKunci_(function () {
      var ada = cariBaris_(bacaTabel_('PENGATURAN'), 'KUNCI', kunciData);
      var nilaiLama = ada ? Number(ada.NILAI) : 0;

      if (ada) {
        perbaruiBaris_('PENGATURAN', ada._baris, { NILAI: String(nominal), KETERANGAN: keterangan }, true);
      } else {
        var posisi = tambahBaris_('PENGATURAN', { KUNCI: kunciData, NILAI: String(nominal), KETERANGAN: keterangan }, true);
        pastikanBarisTersimpan_('PENGATURAN', posisi, 'KUNCI', kunciData);
      }

      catatRiwayatAman_(profil, 'PENGATURAN', kunciData, 'UBAH_NOMINAL',
        'Nominal ' + formatRupiahServer_(nominal) + ' berlaku mulai ' + NAMA_BULAN[bulan - 1] + ' ' + tahun +
        (nilaiLama ? ' (sebelumnya ' + formatRupiahServer_(nilaiLama) + ' untuk periode yang sama)' : ''));

      return {
        berhasil: true,
        pesan: 'Nominal infaq ' + formatRupiahServer_(nominal) + ' berlaku mulai ' + NAMA_BULAN[bulan - 1] + ' ' + tahun + ' berhasil disimpan.'
      };
    });
  } catch (err) {
    return galatKeRespons_(err);
  }
}