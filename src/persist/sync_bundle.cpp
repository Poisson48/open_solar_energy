#include "sync_bundle.h"

#include <QtEndian>

namespace ose {
namespace {

quint32 crc32Bytes(const QByteArray& data)
{
    static quint32 table[256];
    static bool init = false;
    if (!init) {
        for (quint32 i = 0; i < 256; ++i) {
            quint32 c = i;
            for (int j = 0; j < 8; ++j)
                c = (c & 1) ? (0xEDB88320u ^ (c >> 1)) : (c >> 1);
            table[i] = c;
        }
        init = true;
    }
    quint32 crc = 0xFFFFFFFFu;
    for (unsigned char b : data)
        crc = table[(crc ^ b) & 0xFFu] ^ (crc >> 8);
    return crc ^ 0xFFFFFFFFu;
}

void appendU16(QByteArray& out, quint16 v)
{
    char buf[2];
    qToLittleEndian(v, buf);
    out.append(buf, 2);
}

void appendU32(QByteArray& out, quint32 v)
{
    char buf[4];
    qToLittleEndian(v, buf);
    out.append(buf, 4);
}

quint16 readU16(const QByteArray& in, int off)
{
    if (off + 2 > in.size())
        return 0;
    return qFromLittleEndian<quint16>(in.constData() + off);
}

quint32 readU32(const QByteArray& in, int off)
{
    if (off + 4 > in.size())
        return 0;
    return qFromLittleEndian<quint32>(in.constData() + off);
}

} // namespace

void SyncBundle::clear()
{
    m_files.clear();
}

void SyncBundle::put(const QString& path, const QByteArray& data)
{
    m_files.insert(path, data);
}

QByteArray SyncBundle::get(const QString& path) const
{
    return m_files.value(path);
}

bool SyncBundle::contains(const QString& path) const
{
    return m_files.contains(path);
}

QStringList SyncBundle::paths() const
{
    return m_files.keys();
}

QByteArray SyncBundle::toZipBytes() const
{
    QByteArray out;
    QByteArray central;
    quint16 count = 0;
    const auto keys = m_files.keys();
    for (const QString& name : keys) {
        const QByteArray rawName = name.toUtf8();
        const QByteArray data = m_files.value(name);
        const quint32 crc = crc32Bytes(data);
        const quint32 sz = static_cast<quint32>(data.size());
        const quint32 localOffset = static_cast<quint32>(out.size());

        // Local file header
        appendU32(out, 0x04034b50u);
        appendU16(out, 20); // version needed
        appendU16(out, 0);  // flags
        appendU16(out, 0);  // method store
        appendU16(out, 0);  // time
        appendU16(out, 0);  // date
        appendU32(out, crc);
        appendU32(out, sz);
        appendU32(out, sz);
        appendU16(out, static_cast<quint16>(rawName.size()));
        appendU16(out, 0); // extra
        out.append(rawName);
        out.append(data);

        // Central directory header
        appendU32(central, 0x02014b50u);
        appendU16(central, 20);
        appendU16(central, 20);
        appendU16(central, 0);
        appendU16(central, 0);
        appendU16(central, 0);
        appendU16(central, 0);
        appendU32(central, crc);
        appendU32(central, sz);
        appendU32(central, sz);
        appendU16(central, static_cast<quint16>(rawName.size()));
        appendU16(central, 0);
        appendU16(central, 0);
        appendU16(central, 0);
        appendU16(central, 0);
        appendU32(central, 0);
        appendU32(central, localOffset);
        central.append(rawName);
        ++count;
    }

    const quint32 centralOffset = static_cast<quint32>(out.size());
    out.append(central);
    // End of central directory
    appendU32(out, 0x06054b50u);
    appendU16(out, 0);
    appendU16(out, 0);
    appendU16(out, count);
    appendU16(out, count);
    appendU32(out, static_cast<quint32>(central.size()));
    appendU32(out, centralOffset);
    appendU16(out, 0);
    return out;
}

bool SyncBundle::fromZipBytes(const QByteArray& zip)
{
    m_files.clear();
    if (zip.size() < 22)
        return false;

    // Find EOCD
    int eocd = -1;
    for (int i = zip.size() - 22; i >= 0 && i >= zip.size() - 65557; --i) {
        if (readU32(zip, i) == 0x06054b50u) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0)
        return false;

    const quint16 count = readU16(zip, eocd + 8);
    const quint32 centralSize = readU32(zip, eocd + 12);
    const quint32 centralOffset = readU32(zip, eocd + 16);
    Q_UNUSED(centralSize);

    int off = static_cast<int>(centralOffset);
    for (quint16 n = 0; n < count; ++n) {
        if (off + 46 > zip.size() || readU32(zip, off) != 0x02014b50u)
            return false;
        const quint16 method = readU16(zip, off + 10);
        const quint32 compSize = readU32(zip, off + 20);
        const quint16 nameLen = readU16(zip, off + 28);
        const quint16 extraLen = readU16(zip, off + 30);
        const quint16 commentLen = readU16(zip, off + 32);
        const quint32 localOff = readU32(zip, off + 42);
        if (off + 46 + nameLen > zip.size())
            return false;
        const QString name = QString::fromUtf8(zip.constData() + off + 46, nameLen);
        off += 46 + nameLen + extraLen + commentLen;

        if (method != 0)
            return false; // store only
        if (static_cast<int>(localOff) + 30 > zip.size() || readU32(zip, static_cast<int>(localOff)) != 0x04034b50u)
            return false;
        const quint16 localNameLen = readU16(zip, static_cast<int>(localOff) + 26);
        const quint16 localExtra = readU16(zip, static_cast<int>(localOff) + 28);
        const int dataOff = static_cast<int>(localOff) + 30 + localNameLen + localExtra;
        if (dataOff + static_cast<int>(compSize) > zip.size())
            return false;
        m_files.insert(name, zip.mid(dataOff, static_cast<int>(compSize)));
    }
    return isValid() || !m_files.isEmpty();
}

} // namespace ose
