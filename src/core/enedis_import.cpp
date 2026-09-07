#include "enedis_import.h"

#include <QFile>
#include <QRegularExpression>
#include <QStringList>
#include <QTextStream>
#include <cmath>

namespace ose {

EnedisImport::EnedisImport(QObject* parent) : QObject(parent) {}

QVariantMap EnedisImport::parseFile(const QString& path) const
{
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

    // Détection séparateur
    const QString sample = lines.value(0) + lines.value(1);
    QChar sep = QLatin1Char(';');
    if (sample.count(QLatin1Char(';')) < sample.count(QLatin1Char(',')))
        sep = QLatin1Char(',');
    if (sample.count(QLatin1Char('\t')) > sample.count(sep))
        sep = QLatin1Char('\t');

    QVector<double> monthly(12, 0.0);
    int matched = 0;
    QRegularExpression dateRe(QStringLiteral(R"((\d{4})[-/](\d{1,2})[-/](\d{1,2}))"));
    QRegularExpression dateFr(QStringLiteral(R"((\d{1,2})[-/](\d{1,2})[-/](\d{4}))"));

    for (const QString& line : lines) {
        if (line.trimmed().isEmpty() || line.contains(QStringLiteral("Date"), Qt::CaseInsensitive))
            continue;
        const QStringList cols = line.split(sep);
        if (cols.size() < 2)
            continue;

        int month = -1;
        QRegularExpressionMatch m = dateRe.match(cols[0]);
        if (m.hasMatch()) {
            month = m.captured(2).toInt();
        } else {
            m = dateFr.match(cols[0]);
            if (m.hasMatch())
                month = m.captured(2).toInt();
        }
        if (month < 1 || month > 12)
            continue;

        // Dernière colonne numérique = valeur
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

        // Heuristique unité : > 500 pour un mois → probablement Wh
        if (val > 500 && val < 1e8)
            val /= 1000.0; // Wh → kWh (journalier agrégé) ou Wh mensuel
        monthly[month - 1] += val;
        ++matched;
    }

    if (matched == 0) {
        // Essai : 12 valeurs numériques seules
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
    return {{QStringLiteral("ok"), true},
            {QStringLiteral("monthlyKwh"), out},
            {QStringLiteral("annualKwh"), int(std::lround(total))},
            {QStringLiteral("rows"), matched}};
}

} // namespace ose
