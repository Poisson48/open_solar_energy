#include "pdf_export.h"

#include <QDate>
#include <QLocale>
#include <QDir>
#include <QPdfWriter>
#include <QPainter>
#include <QStandardPaths>
#include <QVariantList>
#include <QVariantMap>

namespace ose {

PdfExport::PdfExport(QObject* parent) : QObject(parent) {}

QString PdfExport::exportQuote(const QString& title, const QString& client,
                               const QVariantList& lines, double tvaRate)
{
    const QString dir = QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation)
                        + QStringLiteral("/OpenSolarEnergy");
    QDir().mkpath(dir);
    const QString path = dir + QStringLiteral("/devis_")
                         + QDate::currentDate().toString(QStringLiteral("yyyyMMdd"))
                         + QStringLiteral(".pdf");

    QPdfWriter writer(path);
    writer.setTitle(title.isEmpty() ? QStringLiteral("Devis PV") : title);
    writer.setPageSize(QPageSize(QPageSize::A4));
    writer.setResolution(96);

    QPainter p(&writer);
    if (!p.isActive())
        return {};

    const int margin = 40;
    int y = margin;
    QFont titleFont = p.font();
    titleFont.setPointSize(16);
    titleFont.setBold(true);
    p.setFont(titleFont);
    p.drawText(margin, y, title.isEmpty() ? QStringLiteral("Devis Open Solar Energy") : title);
    y += 28;

    QFont body = p.font();
    body.setPointSize(11);
    body.setBold(false);
    p.setFont(body);
    p.drawText(margin, y, QStringLiteral("Client : %1").arg(client.isEmpty() ? QStringLiteral("—") : client));
    y += 20;
    p.drawText(margin, y, QStringLiteral("Date : %1").arg(QDate::currentDate().toString(Qt::ISODate)));
    y += 30;

    double ht = 0;
    p.drawText(margin, y, QStringLiteral("Désignation"));
    p.drawText(margin + 320, y, QStringLiteral("Montant HT"));
    y += 18;
    p.drawLine(margin, y, margin + 500, y);
    y += 16;

    for (const QVariant& v : lines) {
        const QVariantMap m = v.toMap();
        const QString label = m.value(QStringLiteral("label")).toString();
        const double amount = m.value(QStringLiteral("amount")).toDouble();
        ht += amount;
        p.drawText(margin, y, label.left(48));
        p.drawText(margin + 320, y, QStringLiteral("%1 €").arg(amount, 0, 'f', 2));
        y += 18;
        if (y > 700) {
            writer.newPage();
            y = margin;
        }
    }

    y += 12;
    p.drawLine(margin, y, margin + 500, y);
    y += 20;
    const double tva = ht * tvaRate;
    const double ttc = ht + tva;
    p.drawText(margin + 280, y, QStringLiteral("Total HT : %1 €").arg(ht, 0, 'f', 2));
    y += 18;
    p.drawText(margin + 280, y, QStringLiteral("TVA : %1 €").arg(tva, 0, 'f', 2));
    y += 18;
    titleFont.setPointSize(12);
    p.setFont(titleFont);
    p.drawText(margin + 280, y, QStringLiteral("Total TTC : %1 €").arg(ttc, 0, 'f', 2));
    p.end();
    return path;
}

} // namespace ose
