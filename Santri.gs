/**
 * Santri.gs
 * Data santri. Admin: tambah, edit, nonaktifkan. Petugas: hanya melihat kelompoknya.
 * TIDAK ADA fungsi hapus: santri hanya bisa dinonaktifkan agar riwayat pembayaran aman.
 */

/**
 * Peta ID kelompok ke {id, nama, aktif}.
 */
function petaKelompok_() {
  var peta = {};
  bacaTabel_('KELOMPOK').forEach(function (k) {
    var id = String(k.ID_KELOMPOK).trim();
    if (id) {
      peta[id] = {
        id: id,
        nama: String(k.NAMA_KELOMPOK).trim() || id,
        aktif: adalahAktif_(k.STATUS_AKTIF)
      };
    }
  });
  return peta;
}

/**
 * Daftar santri. Cakupan ditentukan SERVER:
 * Admin melihat semua, Petugas hanya kelompoknya sendiri (hanya baca).
 */
function ambilDaftarSantri(token) {
  try {
    var profil = wajibLogin_(token);
    var adalahAdmin = profil.role === ROLE_ADMIN;
    var peta = petaKelompok_();

    var jumlahBayar = {};
    bacaTabel_('PEMBAYARAN').forEach(function (p) {
      if (String(p.ID_PEMBAYARAN).trim() && transaksiSah_(p)) {
        var idS = String(p.ID_SANTRI).trim();
        jumlahBayar[idS] = (jumlahBayar[idS] || 0) + 1;
      }
    });

    var daftar = [];
    bacaTabel_('SANTRI').forEach(function (s) {
      var id = String(s.ID_SANTRI).trim();
      if (!id) { return; }
      var idKel = String(s.ID_KELOMPOK).trim();
      if (!adalahAdmin && idKel !== profil.idKelompok) { return; }
      daftar.push({
        idSantri: id,
        nis: String(s.NIS).trim(),
        nama: String(s.NAMA_SANTRI).trim(),
        idKelompok: idKel,
        namaKelompok: peta[idKel] ? peta[idKel].nama : idKel,
        namaOrangTua: String(s.NAMA_ORANG_TUA).trim(),
        nomorWa: String(s.NOMOR_WA).trim(),
        tanggalMasuk: formatTanggalIso_(s.TANGGAL_MASUK),
        aktif: adalahAktif_(s.STATUS_AKTIF),
        tanggalNonaktif: formatTanggalIso_(s.TANGGAL_NONAKTIF),
        jumlahPembayaran: jumlahBayar[id] || 0
      });
    });
    daftar.sort(function (a, b) { return a.nama.localeCompare(b.nama, 'id'); });

    var kelompok = Object.keys(peta)
      .map(function (id) { return peta[id]; })
      .filter(function (k) { return adalahAdmin || k.id === profil.idKelompok; })
      .sort(function (a, b) { return a.nama.localeCompare(b.nama, 'id'); });

    return { berhasil: true, data: { santri: daftar, kelompok: kelompok } };
  } catch (err) {
    return galatKeRespons_(err);
  }
}

/**
 * Tambah atau edit santri (khusus Admin).
 * data.idSantri kosong = santri baru.
 */
function simpanSantri(token, data) {
  try {
    var profil = wajibLogin_(token);
    wajibAdmin_(profil);

    if (!data || typeof data !== 'object') {
      throw buatGalat_('DATA_TIDAK_VALID', 'Data tidak lengkap.');
    }

    var idSantri = bersihkanTeks_(data.idSantri);
    var nis = validasiNis_(data.nis);
    var nama = validasiTeks_(data.nama, 'Nama santri', 3, 80);
    var namaOrtu = validasiTeks_(data.namaOrangTua, 'Nama orang tua', 3, 80);
    var nomorWa = normalisasiNomorWa_(data.nomorWa);
    var tanggalMasuk = validasiTanggalIso_(data.tanggalMasuk, 'Tanggal masuk');
    var idKelompok = bersihkanTeks_(data.idKelompok);

    return dalamKunci_(function () {
      var kelompok = petaKelompok_()[idKelompok];
      if (!kelompok) {
        throw buatGalat_('DATA_TIDAK_VALID', 'Pilih kelompok yang valid.');
      }

      var semua = bacaTabel_('SANTRI');
      var lama = null;
      if (idSantri) {
        lama = cariBaris_(semua, 'ID_SANTRI', idSantri);
        if (!lama) {
          throw buatGalat_('DATA_TIDAK_VALID', 'Data santri tidak ditemukan.');
        }
      }

      var kelompokTidakBerubah = lama && String(lama.ID_KELOMPOK).trim() === idKelompok;
      if (!kelompok.aktif && !kelompokTidakBerubah) {
        throw buatGalat_('DATA_TIDAK_VALID', 'Kelompok "' + kelompok.nama + '" tidak aktif. Pilih kelompok lain.');
      }

      semua.forEach(function (s) {
        if (String(s.NIS).trim().toLowerCase() === nis.toLowerCase() && String(s.ID_SANTRI).trim() !== idSantri) {
          throw buatGalat_('DATA_TIDAK_VALID', 'NIS "' + nis + '" sudah dipakai santri lain.');
        }
      });

      if (!lama) {
        var id = buatId_('SNT');
        var posisi = tambahBaris_('SANTRI', {
          ID_SANTRI: id,
          NIS: nis,
          NAMA_SANTRI: nama,
          ID_KELOMPOK: idKelompok,
          NAMA_ORANG_TUA: namaOrtu,
          NOMOR_WA: nomorWa,
          TANGGAL_MASUK: tanggalMasuk,
          STATUS_AKTIF: STATUS_AKTIF,
          TANGGAL_NONAKTIF: ''
        }, true);
        pastikanBarisTersimpan_('SANTRI', posisi, 'ID_SANTRI', id);
        return { berhasil: true, pesan: 'Santri "' + nama + '" berhasil ditambahkan.', idSantri: id };
      }

      perbaruiBaris_('SANTRI', lama._baris, {
        NIS: nis,
        NAMA_SANTRI: nama,
        ID_KELOMPOK: idKelompok,
        NAMA_ORANG_TUA: namaOrtu,
        NOMOR_WA: nomorWa,
        TANGGAL_MASUK: tanggalMasuk
      }, true);
      return { berhasil: true, pesan: 'Data santri "' + nama + '" berhasil diperbarui.', idSantri: idSantri };
    });
  } catch (err) {
    return galatKeRespons_(err);
  }
}

/**
 * Menonaktifkan atau mengaktifkan santri (khusus Admin). Data tidak dihapus.
 * Saat menonaktifkan, tanggalBerhenti wajib diisi (yyyy-MM-dd): bulan pada tanggal itu
 * masih ditagih, bulan sesudahnya tidak. Saat mengaktifkan kembali, tanggal berhenti dihapus.
 */
function ubahStatusSantri(token, idSantri, aktifBaru, tanggalBerhenti) {
  try {
    var profil = wajibLogin_(token);
    wajibAdmin_(profil);

    idSantri = bersihkanTeks_(idSantri);
    aktifBaru = (aktifBaru === true);

    var tanggal = '';
    if (!aktifBaru) {
      tanggal = validasiTanggalIso_(tanggalBerhenti, 'Tanggal berhenti');
    }

    return dalamKunci_(function () {
      var s = cariBaris_(bacaTabel_('SANTRI'), 'ID_SANTRI', idSantri);
      if (!s) {
        throw buatGalat_('DATA_TIDAK_VALID', 'Data santri tidak ditemukan.');
      }
      if (aktifBaru) {
        var kel = petaKelompok_()[String(s.ID_KELOMPOK).trim()];
        if (!kel || !kel.aktif) {
          throw buatGalat_('DATA_TIDAK_VALID', 'Kelompok santri ini tidak aktif. Aktifkan kelompoknya atau pindahkan santri terlebih dahulu.');
        }
      } else {
        var masuk = formatTanggalIso_(s.TANGGAL_MASUK);
        if (/^\d{4}-\d{2}-\d{2}$/.test(masuk) && tanggal < masuk) {
          throw buatGalat_('DATA_TIDAK_VALID', 'Tanggal berhenti tidak boleh sebelum tanggal masuk santri (' + masuk + ').');
        }
      }

      perbaruiBaris_('SANTRI', s._baris, {
        STATUS_AKTIF: aktifBaru ? STATUS_AKTIF : STATUS_NONAKTIF,
        TANGGAL_NONAKTIF: aktifBaru ? '' : tanggal
      }, true);

      return {
        berhasil: true,
        pesan: 'Santri "' + String(s.NAMA_SANTRI).trim() + '" berhasil ' + (aktifBaru ? 'diaktifkan.' : 'dinonaktifkan.')
      };
    });
  } catch (err) {
    return galatKeRespons_(err);
  }
}