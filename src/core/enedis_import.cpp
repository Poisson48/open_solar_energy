#include "enedis_import.h"

#include <QFile>
#include <QFileInfo>
#include <QProcess>
#include <QRegularExpression>
#include <QStringList>
#include <QTextStream>
#include <cmath>

namespace ose {

EnedisImport::EnedisImport(QObject* parent) : QObject(parent) {}

QVariantMap EnedisImport::parseFile(const QString& path) const
{
    QFileInfo fi(path);
    if (!fi.exists())
        return {{QStringLiteral("ok"), false},
                {QStringLiteral("error"), QStringLiteral("Fichier introuvable")}};

    if (fi.suffix().compare(QLatin1String("zip"), Qt::CaseInsensitive) == 0) {
        QProcess unzip;
        unzip.start(QStringLiteral("unzip"),
                    {QStringLiteral("-p"), path, QStringLiteral("*.csv")});
        if (!unzip.waitForFinished(15000) || unzip.exitCode() != 0) {
            // Fallback: list then extract first csv-like entry
            unzip.start(QStringLiteral("unzip"), {QStringLiteral("-Z1"), path});
            if (!unzip.waitForFinished(8000) || unzip.exitCode() != 0)
                return {{QStringLiteral("ok"), false},
                        {QStringLiteral("error"),
                         QStringLiteral("ZIP illisible (installez unzip)")}};
            const QStringList names =
                QString::fromUtf8(unzip.readAllStandardOutput()).split(QLatin1Char('\n'), Qt::SkipEmptyParts);
            QString csvName;
            for (const QString& n : names) {
                if (n.contains(QLatin1String(".csv"), Qt::CaseInsensitive)
                    || n.contains(QLatin1String(".txt"), Qt::CaseInsensitive)) {
                    csvName = n;
                    break;
                }
            }
            if (csvName.isEmpty())
                return {{QStringLiteral("ok"), false},
                        {QStringLiteral("error"), QStringLiteral("Aucun CSV dans le ZIP")}};
            unzip.start(QStringLiteral("unzip"), {QStringLiteral("-p"), path, csvName});
            if (!unzip.waitForFinished(15000) || unzip.exitCode() != 0)
                return {{QStringLiteral("ok"), false},
                        {QStringLiteral("error"), QStringLiteral("Extraction ZIP échouée")}};
        }
        return parse(QString::fromUtf8(unzip.readAllStandardOutput()));
    }

    QFile f(path);
    if (!f.open(QIODevice::ReadOnly | QIODevice::Text))
        return {{QStringLiteral("ok"), false},
                {QStringLiteral("error"), QStringLiteral("Impossible d'ouvrir le fichier")}};
    return parse(QString::fromUtf8(f.readAll()));
}

QVariantMap EnedisImport::parse(const QString& text) const
{
    QString t = text;
    if (t.startsWith(QChar(0xFEFF)))
        t.remove(0, 1);

    QStringList lines = t.split(QRegularExpression(QStringLiteral("[\r\n]+")), Qt::SkipEmptyParts);
    if (lines.isEmpty())
        return {{QStringLiteral("ok"), false}, {QStringLiteral("error"), QStringLiteral("Fichier vide")}};

    const QString sample = lines.value(0) + lines.value(1);
    QChar sep = QLatin1Char(';');
    if (sample.count(QLatin1Char(';')) < sample.count(QLatin1Char(',')))
        sep = QLatin1Char(',');
    if (sample.count(QLatin1Char('\t')) > sample.count(sep))
        sep = QLatin1Char('\t');

    QVector<double> monthly(12, 0.0);
    QVector<double> dayNight(2, 0.0); // day 6-21, night 21-6
    QVector<double> slots48(48, 0.0);
    int halfHourRows = 0;
    int matched = 0;
    QRegularExpression dateRe(QStringLiteral(R"((\d{4})[-/](\d{1,2})[-/](\d{1,2}))"));
    QRegularExpression dateFr(QStringLiteral(R"((\d{1,2})[-/](\d{1,2})[-/](\d{4}))"));
    QRegularExpression timeRe(QStringLiteral(R"((\d{1,2}):(\d{2}))"));

    for (const QString& line : lines) {
        if (line.trimmed().isEmpty() || line.contains(QStringLiteral("Date"), Qt::CaseInsensitive))
            continue;
        const QStringList cols = line.split(sep);
        if (cols.size() < 2)
            continue;

        int month = -1;
        int hour = -1;
        int minute = 0;
        QRegularExpressionMatch m = dateRe.match(cols[0]);
        if (m.hasMatch()) {
            month = m.captured(2).toInt();
        } else {
            m = dateFr.match(cols[0]);
            if (m.hasMatch())
                month = m.captured(2).toInt();
        }
        // Time may be in col0 or col1
        QRegularExpressionMatch tm = timeRe.match(cols[0]);
        if (!tm.hasMatch() && cols.size() > 1)
            tm = timeRe.match(cols[1]);
        if (tm.hasMatch()) {
            hour = tm.captured(1).toInt();
            minute = tm.captured(2).toInt();
        }
        if (month < 1 || month > 12)
            continue;

        double val = 0;
        bool ok = false;
        for (int i = cols.size() - 1; i >= 1; --i) {
            QString c = cols[i].trimmed().replace(QLatin1Char(','), QLatin1Char('.'));
            c.remove(QRegularExpression(QStringLiteral("[^0-9.\\-]")));
            val = c.toDouble(&ok);
            if (ok && val >= 0)
                break;
        }
        if (!ok)
            continue;

        // Wh → kWh heuristic for interval data
        if (hour >= 0) {
            if (val > 50)
                val /= 1000.0;
            monthly[month - 1] += val;
            const int slot = hour * 2 + (minute >= 30 ? 1 : 0);
            if (slot >= 0 && slot < 48) {
                slots48[slot] += val;
                ++halfHourRows;
            }
            if (hour >= 6 && hour < 21)
                dayNight[0] += val;
            else
                dayNight[1] += val;
            ++matched;
            continue;
        }

        if (val > 500 && val < 1e8)
            val /= 1000.0;
        monthly[month - 1] += val;
        ++matched;
    }

    if (matched == 0) {
        QVector<double> nums;
        for (const QString& line : lines) {
            for (const QString& col : line.split(sep)) {
                QString c = col.trimmed().replace(QLatin1Char(','), QLatin1Char('.'));
                bool ok = false;
                const double v = c.toDouble(&ok);
                if (ok && v >= 0)
                    nums.append(v);
            }
        }
        if (nums.size() >= 12) {
            for (int i = 0; i < 12; ++i)
                monthly[i] = nums[i] > 500 ? nums[i] / 1000.0 : nums[i];
            matched = 12;
        }
    }

    if (matched == 0)
        return {{QStringLiteral("ok"), false},
                {QStringLiteral("error"), QStringLiteral("Aucune donnée mensuelle détectée")}};

    QVariantList out;
    double total = 0;
    for (double v : monthly) {
        out.append(std::round(v * 10) / 10);
        total += v;
    }

    QVariantMap result{{QStringLiteral("ok"), true},
                       {QStringLiteral("monthlyKwh"), out},
                       {QStringLiteral("annualKwh"), int(std::lround(total))},
                       {QStringLiteral("rows"), matched}};

    if (halfHourRows >= 48) {
        // Normalize slots to average kWh per half-hour of a representative day
        const double days = std::max(1.0, halfHourRows / 48.0);
        QVariantList profile;
        double dayKwh = 0, nightKwh = 0;
        for (int i = 0; i < 48; ++i) {
            const double v = slots48[i] / days;
            profile.append(std::round(v * 1000) / 1000);
            if (i >= 12 && i < 42)
                dayKwh += v;
            else
                nightKwh += v;
        }
        result.insert(QStringLiteral("halfHourly"), true);
        result.insert(QStringLiteral("halfHourlyProfile"), profile);
        result.insert(QStringLiteral("loadDayKwh"), std::round(dayKwh * 10) / 10);
        result.insert(QStringLiteral("loadNightKwh"), std::round(nightKwh * 10) / 10);
    } else if (dayNight[0] + dayNight[1] > 0) {
        result.insert(QStringLiteral("loadDayKwh"), std::round(dayNight[0] / 365.0 * 10) / 10);
        result.insert(QStringLiteral("loadNightKwh"), std::round(dayNight[1] / 365.0 * 10) / 10);
    }

    return result;
}

} // namespace ose
