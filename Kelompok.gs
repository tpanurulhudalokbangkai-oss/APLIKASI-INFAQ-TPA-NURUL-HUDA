/**
 * Kelompok.gs
 * Data kelompok dan akun Petugas. SEMUA fungsi publik di file ini khusus Admin.
 * Akses petugas ditentukan oleh PENGGUNA.ID_KELOMPOK (dibaca server setiap permintaan).
 * KELOMPOK.ID_PETUGAS dijaga sama sebagai catatan penanggung jawab.
 */

/* ======================== PEMBANTU PENUGASAN ======================== */

/**
 * Menetapkan satu petugas pada satu kelompok.
 * - Petugas lama pada kelompok itu dilepas.
 * - Penunjukan lama milik petugas ini pada kelompok lain dilepas.
 * Harus dipanggil di dalam dalamKunci_().
 */
function tetapkanPetugasKelompok_(idPetugas, idKelompok) {
  var daftarPengguna = bacaTabel_('PENGGUNA');
  var daftarKelompok = bacaTabel_('KELOMPOK');

  daftarPengguna.forEach(function (u) {
    if (String(u.ROLE).trim().toUpperCase() === ROLE_PETUGAS &&
        String(u.ID_KELOMPOK).trim() === idKelompok &&
        String(u.ID_PENGGUNA).trim() !== idPetugas) {
      perbaruiBaris_('PENGGUNA', u._baris, { ID_KELOMPOK: '' }, true);
    }
  });

  daftarKelompok.forEach(function (k) {
    if (String(k.ID_PETUGAS).trim() === idPetugas && String(k.ID_KELOMPOK).trim() !== idKelompok) {
      perbaruiBaris_('KELOMPOK', k._baris, { ID_PETUGAS: '' }, true);
    }
  });

  var petugas = cariBaris_(daftarPengguna, 'ID_PENGGUNA', idPetugas);
  var kelompok = cariBaris_(daftarKelompok, 'ID_KELOMPOK', idKelompok);
  if (!petugas || !kelompok) {
    throw buatGalat_('DATA_TIDAK_VALID', 'Petugas atau kelompok tidak ditemukan.');
  }
  perbaruiBaris_('PENGGUNA', petugas._baris, { ID_KELOMPOK: idKelompok }, true);
  perbaruiBaris_('KELOMPOK', kelompok._baris, { ID_PETUGAS: idPetugas }, true);
}

/**
 * Melepas semua petugas dari satu kelompok. Dipanggil di dalam dalamKunci_().
 */
function kosongkanPetugasKelompok_(idKelompok) {
  bacaTabel_('PENGGUNA').forEach(function (u) {
    if (String(u.ROLE).trim().toUpperCase() === ROLE_PETUGAS && String(u.ID_KELOMPOK).trim() === idKelompok) {
      perbaruiBaris_('PENGGUNA', u._baris, { ID_KELOMPOK: '' }, true);
    }
  });
  var k = cariBaris_(bacaTabel_('KELOMPOK'), 'ID_KELOMPOK', idKelompok);
  if (k && String(k.ID_PETUGAS).trim() !== '') {
    perbaruiBaris_('KELOMPOK', k._baris, { ID_PETUGAS: '' }, true);
  }
}

/* ======================== KELOMPOK ======================== */

function ambilDataKelompok(token) {
  try {
    var profil = wajibLogin_(token);
    wajibAdmin_(profil);

    var daftarPetugas = [];
    var petugasPerKelompok = {};
    bacaTabel_('PENGGUNA').forEach(function (u) {
      if (String(u.ROLE).trim().toUpperCase() !== ROLE_PETUGAS) { return; }
      var item = {
        idPengguna: String(u.ID_PENGGUNA).trim(),
        nama: String(u.NAMA).trim(),
        username: String(u.USERNAME).trim(),
        aktif: adalahAktif_(u.STATUS_AKTIF)
      };
      daftarPetugas.push(item);
      var idKel = String(u.ID_KELOMPOK).trim();
      if (idKel) {
        if (!petugasPerKelompok[idKel]) { petugasPerKelompok[idKel] = []; }
        petugasPerKelompok[idKel].push(item);
      }
    });
    daftarPetugas.sort(function (a, b) { return a.nama.localeCompare(b.nama, 'id'); });

    var jumlahSantri = {};
    bacaTabel_('SANTRI').forEach(function (s) {
      if (adalahAktif_(s.STATUS_AKTIF)) {
        var idKel = String(s.ID_KELOMPOK).trim();
        jumlahSantri[idKel] = (jumlahSantri[idKel] || 0) + 1;
      }
    });

    var kelompok = [];
    bacaTabel_('KELOMPOK').forEach(function (k) {
      var id = String(k.ID_KELOMPOK).trim();
      if (!id) { return; }
      var pegang = (petugasPerKelompok[id] || []).slice().sort(function (a, b) {
        return (a.aktif === b.aktif) ? 0 : (a.aktif ? -1 : 1);
      });
      kelompok.push({
        idKelompok: id,
        nama: String(k.NAMA_KELOMPOK).trim() || id,
        idPetugas: pegang.length ? pegang[0].idPengguna : '',
        namaPetugas: pegang.map(function (p) { return p.nama + (p.aktif ? '' : ' (nonaktif)'); }).join(', '),
        aktif: adalahAktif_(k.STATUS_AKTIF),
        jumlahSantriAktif: jumlahSantri[id] || 0
      });
    });
    kelompok.sort(function (a, b) { return a.nama.localeCompare(b.nama, 'id'); });

    return { berhasil: true, data: { kelompok: kelompok, petugas: daftarPetugas } };
  } catch (err) {
    return galatKeRespons_(err);
  }
}

function simpanKelompok(token, data) {
  try {
    var profil = wajibLogin_(token);
    wajibAdmin_(profil);

    if (!data || typeof data !== 'object') {
      throw buatGalat_('DATA_TIDAK_VALID', 'Data tidak lengkap.');
    }
    var idKelompok = bersihkanTeks_(data.idKelompok);
    var nama = validasiTeks_(data.nama, 'Nama kelompok', 1, 50);
    var idPetugas = bersihkanTeks_(data.idPetugas);

    return dalamKunci_(function () {
      var semua = bacaTabel_('KELOMPOK');
      var lama = null;
      if (idKelompok) {
        lama = cariBaris_(semua, 'ID_KELOMPOK', idKelompok);
        if (!lama) {
          throw buatGalat_('DATA_TIDAK_VALID', 'Kelompok tidak ditemukan.');
        }
      }

      semua.forEach(function (k) {
        if (bersihkanTeks_(k.NAMA_KELOMPOK).toLowerCase() === nama.toLowerCase() && String(k.ID_KELOMPOK).trim() !== idKelompok) {
          throw buatGalat_('DATA_TIDAK_VALID', 'Nama kelompok "' + nama + '" sudah dipakai.');
        }
      });

      if (idPetugas) {
        var petugas = cariBaris_(bacaTabel_('PENGGUNA'), 'ID_PENGGUNA', idPetugas);
        if (!petugas || String(petugas.ROLE).trim().toUpperCase() !== ROLE_PETUGAS || !adalahAktif_(petugas.STATUS_AKTIF)) {
          throw buatGalat_('DATA_TIDAK_VALID', 'Petugas tidak ditemukan atau tidak aktif.');
        }
      }

      var id = idKelompok;
      if (!lama) {
        id = buatId_('KLP');
        var posisi = tambahBaris_('KELOMPOK', {
          ID_KELOMPOK: id,
          NAMA_KELOMPOK: nama,
          ID_PETUGAS: '',
          STATUS_AKTIF: STATUS_AKTIF
        }, true);
        pastikanBarisTersimpan_('KELOMPOK', posisi, 'ID_KELOMPOK', id);
      } else {
        perbaruiBaris_('KELOMPOK', lama._baris, { NAMA_KELOMPOK: nama }, true);
      }

      if (idPetugas) {
        tetapkanPetugasKelompok_(idPetugas, id);
      } else if (lama) {
        kosongkanPetugasKelompok_(id);
      }

      return {
        berhasil: true,
        pesan: lama ? 'Kelompok "' + nama + '" berhasil diperbarui.' : 'Kelompok "' + nama + '" berhasil ditambahkan.',
        idKelompok: id
      };
    });
  } catch (err) {
    return galatKeRespons_(err);
  }
}

function ubahStatusKelompok(token, idKelompok, aktifBaru) {
  try {
    var profil = wajibLogin_(token);
    wajibAdmin_(profil);

    idKelompok = bersihkanTeks_(idKelompok);
    aktifBaru = (aktifBaru === true);

    return dalamKunci_(function () {
      var k = cariBaris_(bacaTabel_('KELOMPOK'), 'ID_KELOMPOK', idKelompok);
      if (!k) {
        throw buatGalat_('DATA_TIDAK_VALID', 'Kelompok tidak ditemukan.');
      }
      if (!aktifBaru) {
        var jumlah = bacaTabel_('SANTRI').filter(function (s) {
          return adalahAktif_(s.STATUS_AKTIF) && String(s.ID_KELOMPOK).trim() === idKelompok;
        }).length;
        if (jumlah > 0) {
          throw buatGalat_('DATA_TIDAK_VALID', 'Kelompok masih memiliki ' + jumlah + ' santri aktif. Pindahkan atau nonaktifkan santri tersebut terlebih dahulu.');
        }
      }
      perbaruiBaris_('KELOMPOK', k._baris, { STATUS_AKTIF: aktifBaru ? STATUS_AKTIF : STATUS_NONAKTIF }, true);
      return {
        berhasil: true,
        pesan: 'Kelompok "' + String(k.NAMA_KELOMPOK).trim() + '" berhasil ' + (aktifBaru ? 'diaktifkan.' : 'dinonaktifkan.')
      };
    });
  } catch (err) {
    return galatKeRespons_(err);
  }
}

/* ======================== PETUGAS ======================== */

function ambilDataPetugas(token) {
  try {
    var profil = wajibLogin_(token);
    wajibAdmin_(profil);

    var peta = petaKelompok_();
    var petugas = [];
    bacaTabel_('PENGGUNA').forEach(function (u) {
      if (String(u.ROLE).trim().toUpperCase() !== ROLE_PETUGAS) { return; }
      var idKel = String(u.ID_KELOMPOK).trim();
      petugas.push({
        idPengguna: String(u.ID_PENGGUNA).trim(),
        nama: String(u.NAMA).trim(),
        username: String(u.USERNAME).trim(),
        idKelompok: idKel,
        namaKelompok: idKel ? (peta[idKel] ? peta[idKel].nama : idKel) : '',
        aktif: adalahAktif_(u.STATUS_AKTIF)
      });
    });
    petugas.sort(function (a, b) { return a.nama.localeCompare(b.nama, 'id'); });

    var kelompok = Object.keys(peta)
      .map(function (id) { return peta[id]; })
      .sort(function (a, b) { return a.nama.localeCompare(b.nama, 'id'); });

    return { berhasil: true, data: { petugas: petugas, kelompok: kelompok } };
  } catch (err) {
    return galatKeRespons_(err);
  }
}

/**
 * Tambah atau edit akun petugas.
 * Baru: nama, username, password, idKelompok. Edit: nama dan idKelompok.
 */
function simpanPetugas(token, data) {
  try {
    var profil = wajibLogin_(token);
    wajibAdmin_(profil);

    if (!data || typeof data !== 'object') {
      throw buatGalat_('DATA_TIDAK_VALID', 'Data tidak lengkap.');
    }
    var idPengguna = bersihkanTeks_(data.idPengguna);
    var nama = validasiTeks_(data.nama, 'Nama petugas', 3, 60);
    var idKelompok = bersihkanTeks_(data.idKelompok);

    var kelompok = petaKelompok_()[idKelompok];
    if (!kelompok) {
      throw buatGalat_('DATA_TIDAK_VALID', 'Pilih kelompok yang valid.');
    }

    if (!idPengguna) {
      if (!kelompok.aktif) {
        throw buatGalat_('DATA_TIDAK_VALID', 'Kelompok "' + kelompok.nama + '" tidak aktif.');
      }
      var idBaru = buatPengguna_({
        nama: nama,
        username: data.username,
        password: data.password,
        role: ROLE_PETUGAS,
        idKelompok: idKelompok
      });
      dalamKunci_(function () { tetapkanPetugasKelompok_(idBaru, idKelompok); });
      return { berhasil: true, pesan: 'Akun petugas "' + nama + '" berhasil dibuat.' };
    }

    return dalamKunci_(function () {
      var u = cariBaris_(bacaTabel_('PENGGUNA'), 'ID_PENGGUNA', idPengguna);
      if (!u || String(u.ROLE).trim().toUpperCase() !== ROLE_PETUGAS) {
        throw buatGalat_('DATA_TIDAK_VALID', 'Akun petugas tidak ditemukan.');
      }
      var kelompokBerubah = String(u.ID_KELOMPOK).trim() !== idKelompok;
      if (kelompokBerubah && !kelompok.aktif) {
        throw buatGalat_('DATA_TIDAK_VALID', 'Kelompok "' + kelompok.nama + '" tidak aktif.');
      }
      perbaruiBaris_('PENGGUNA', u._baris, { NAMA: nama }, true);
      if (kelompokBerubah) {
        tetapkanPetugasKelompok_(idPengguna, idKelompok);
      }
      return { berhasil: true, pesan: 'Akun petugas "' + nama + '" berhasil diperbarui.' };
    });
  } catch (err) {
    return galatKeRespons_(err);
  }
}

/**
 * Mengganti password petugas. Percobaan login yang terkunci ikut dibuka.
 */
function resetPasswordPetugas(token, idPengguna, passwordBaru) {
  try {
    var profil = wajibLogin_(token);
    wajibAdmin_(profil);

    idPengguna = bersihkanTeks_(idPengguna);
    var password = String(passwordBaru === null || passwordBaru === undefined ? '' : passwordBaru);

    var u = cariBaris_(bacaTabel_('PENGGUNA'), 'ID_PENGGUNA', idPengguna);
    if (!u || String(u.ROLE).trim().toUpperCase() !== ROLE_PETUGAS) {
      throw buatGalat_('DATA_TIDAK_VALID', 'Akun petugas tidak ditemukan.');
    }
    var username = String(u.USERNAME).trim().toLowerCase();
    validasiPassword_(password, username);
    var hash = buatHashPassword_(password);

    return dalamKunci_(function () {
      var terbaru = cariBaris_(bacaTabel_('PENGGUNA'), 'ID_PENGGUNA', idPengguna);
      if (!terbaru) {
        throw buatGalat_('DATA_TIDAK_VALID', 'Akun petugas tidak ditemukan.');
      }
      perbaruiBaris_('PENGGUNA', terbaru._baris, { PASSWORD_HASH: hash }, true);
      hapusGagal_(username);
      return { berhasil: true, pesan: 'Password "' + String(u.NAMA).trim() + '" berhasil diganti.' };
    });
  } catch (err) {
    return galatKeRespons_(err);
  }
}

function ubahStatusPetugas(token, idPengguna, aktifBaru) {
  try {
    var profil = wajibLogin_(token);
    wajibAdmin_(profil);

    idPengguna = bersihkanTeks_(idPengguna);
    aktifBaru = (aktifBaru === true);

    return dalamKunci_(function () {
      var daftar = bacaTabel_('PENGGUNA');
      var u = cariBaris_(daftar, 'ID_PENGGUNA', idPengguna);
      if (!u || String(u.ROLE).trim().toUpperCase() !== ROLE_PETUGAS) {
        throw buatGalat_('DATA_TIDAK_VALID', 'Akun petugas tidak ditemukan.');
      }

      if (aktifBaru) {
        var idKel = String(u.ID_KELOMPOK).trim();
        if (idKel) {
          daftar.forEach(function (x) {
            if (String(x.ID_PENGGUNA).trim() !== idPengguna &&
                String(x.ROLE).trim().toUpperCase() === ROLE_PETUGAS &&
                adalahAktif_(x.STATUS_AKTIF) &&
                String(x.ID_KELOMPOK).trim() === idKel) {
              throw buatGalat_('DATA_TIDAK_VALID', 'Kelompok petugas ini sudah dipegang petugas aktif lain. Ubah kelompok petugas ini terlebih dahulu.');
            }
          });
          var kel = petaKelompok_()[idKel];
          if (!kel || !kel.aktif) {
            throw buatGalat_('DATA_TIDAK_VALID', 'Kelompok petugas ini tidak aktif. Ubah kelompok petugas ini terlebih dahulu.');
          }
        }
      }

      perbaruiBaris_('PENGGUNA', u._baris, { STATUS_AKTIF: aktifBaru ? STATUS_AKTIF : STATUS_NONAKTIF }, true);
      return {
        berhasil: true,
        pesan: 'Akun "' + String(u.NAMA).trim() + '" berhasil ' + (aktifBaru ? 'diaktifkan.' : 'dinonaktifkan.')
      };
    });
  } catch (err) {
    return galatKeRespons_(err);
  }
}