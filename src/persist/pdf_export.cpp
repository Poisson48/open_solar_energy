#include "pdf_export.h"

#include <QDate>
#include <QDateTime>
#include <QDesktopServices>
#include <QDir>
#include <QFileInfo>
#include <QFont>
#include <QLocale>
#include <QPageSize>
#include <QPainter>
#include <QPdfDocument>
#include <QPdfWriter>
#include <QRegularExpression>
#include <QStandardPaths>
#include <QUrl>
#include <algorithm>
#include <cmath>

namespace ose {
namespace {

const QColor kPrimary(0x1a, 0x6b, 0x3c);
const QColor kAccent(0xf5, 0xa6, 0x23);
const QColor kText(0x1a, 0x2e, 0x23);
const QColor kMuted(0x4d, 0x5f, 0x56);
const QColor kLine(0xd0, 0xdb, 0xd5);
const QColor kHeaderBg(0xe9, 0xf3, 0xed);

QLocale fr() { return QLocale(QLocale::French, QLocale::France); }

QString euro(double v)
{
    return fr().toString(v, 'f', 2) + QStringLiteral(" €");
}

QString num(double v, int d = 0)
{
    return fr().toString(v, 'f', d);
}

QString docsDir()
{
    const QString dir = QStandardPaths::writableLocation(QStandardPaths::DocumentsLocation)
                        + QStringLiteral("/OpenSolarEnergy");
    QDir().mkpath(dir);
    return dir;
}

QString clientName(const QVariantMap& project)
{
    const QVariant c = project.value(QStringLiteral("client"));
    if (c.typeId() == QMetaType::QVariantMap) {
        const QString n = c.toMap().value(QStringLiteral("name")).toString();
        if (!n.isEmpty())
            return n;
    }
    return c.toString();
}

QVariantMap clientMap(const QVariantMap& project)
{
    const QVariant c = project.value(QStringLiteral("client"));
    if (c.typeId() == QMetaType::QVariantMap)
        return c.toMap();
    QVariantMap m;
    if (c.typeId() == QMetaType::QString)
        m.insert(QStringLiteral("name"), c.toString());
    return m;
}

QString installLabel(const QString& t)
{
    if (t == QLatin1String("hybrid"))
        return QStringLiteral("Hybride (réseau + batterie)");
    if (t == QLatin1String("offgrid"))
        return QStringLiteral("Autonome hors réseau");
    return QStringLiteral("Raccordé au réseau");
}

struct PdfCtx {
    QPdfWriter* writer = nullptr;
    QPainter* p = nullptr;
    int margin = 48;
    int y = 48;
    int pageW = 0;
    int pageH = 0;
    int contentW = 0;

    void begin(QPdfWriter* w, QPainter* painter)
    {
        writer = w;
        p = painter;
        pageW = writer->width();
        pageH = writer->height();
        contentW = pageW - 2 * margin;
        y = margin;
    }

    void newPage()
    {
        writer->newPage();
        y = margin;
    }

    void ensure(int need)
    {
        if (y + need > pageH - margin)
            newPage();
    }

    void setFont(int pt, bool bold = false)
    {
        QFont f = p->font();
        f.setFamily(QStringLiteral("Sans Serif"));
        f.setPointSize(pt);
        f.setBold(bold);
        p->setFont(f);
    }

    void drawText(int x, const QString& t, const QColor& c = kText)
    {
        p->setPen(c);
        p->drawText(x, y, t);
    }

    int textHeight() const { return p->fontMetrics().height(); }

    void para(const QString& t, int pt = 9, const QColor& c = kText, int maxW = -1)
    {
        setFont(pt);
        p->setPen(c);
        const int w = maxW > 0 ? maxW : contentW;
        const QRect r(margin, y, w, 400);
        const QRect br = p->boundingRect(r, Qt::TextWordWrap, t);
        ensure(br.height() + 4);
        p->drawText(QRect(margin, y, w, br.height()), Qt::TextWordWrap, t);
        y += br.height() + 6;
    }

    void h1(const QString& t)
    {
        ensure(36);
        setFont(16, true);
        p->setPen(kPrimary);
        p->drawText(margin, y + 16, t);
        y += 28;
        p->setPen(QPen(kPrimary, 2));
        p->drawLine(margin, y, margin + contentW, y);
        y += 14;
    }

    void h2(const QString& t)
    {
        ensure(30);
        setFont(12, true);
        p->setPen(kPrimary);
        p->drawText(margin, y + 12, t);
        y += 20;
        p->setPen(QPen(kLine, 1));
        p->drawLine(margin, y, margin + contentW, y);
        y += 10;
    }

    void kv(const QString& k, const QString& v)
    {
        ensure(16);
        setFont(9);
        p->setPen(kMuted);
        p->drawText(margin, y, k);
        p->setPen(kText);
        setFont(9, true);
        p->drawText(margin + contentW / 2, y, v);
        y += 15;
    }

    void boxHeader(const QString& title, int x, int w)
    {
        p->fillRect(QRect(x, y, w, 18), kHeaderBg);
        p->setPen(kLine);
        p->drawRect(QRect(x, y, w, 18));
        setFont(8, true);
        p->setPen(kPrimary);
        p->drawText(x + 6, y + 13, title);
    }
};

void drawFooter(PdfCtx& c, const QString& label, int pageNo)
{
    c.setFont(7);
    c.p->setPen(kMuted);
    const QString left = QStringLiteral("Open Solar Energy — %1").arg(label);
    const QString right = QStringLiteral("Page %1").arg(pageNo);
    c.p->drawText(c.margin, c.pageH - 22, left);
    const int rw = c.p->fontMetrics().horizontalAdvance(right);
    c.p->drawText(c.pageW - c.margin - rw, c.pageH - 22, right);
}

QString makeRef()
{
    return QStringLiteral("DEV-%1-%2")
        .arg(QDate::currentDate().toString(QStringLiteral("yyMM")))
        .arg(QString::number(QDateTime::currentMSecsSinceEpoch() % 100000, 36).toUpper());
}

} // namespace

PdfExport::PdfExport(QObject* parent) : QObject(parent) {}

QString PdfExport::exportQuote(const QString& title, const QString& client,
                               const QVariantList& lines, double tvaRate)
{
    QVariantMap opts;
    opts.insert(QStringLiteral("lines"), lines);
    opts.insert(QStringLiteral("tvaRate"), tvaRate);
    opts.insert(QStringLiteral("title"), title);
    opts.insert(QStringLiteral("clientName"), client);
    return exportProfessionalQuote({}, opts);
}

QString PdfExport::exportProfessionalQuote(const QVariantMap& project, const QVariantMap& opts)
{
    QVariantList lines = opts.value(QStringLiteral("lines")).toList();
    if (lines.isEmpty())
        lines = project.value(QStringLiteral("quoteLines")).toList();

    const QVariantMap qmeta = project.value(QStringLiteral("quoteMeta")).toMap();
    const QVariantMap installer = opts.value(QStringLiteral("installer")).toMap().isEmpty()
                                      ? qmeta.value(QStringLiteral("installer")).toMap()
                                      : opts.value(QStringLiteral("installer")).toMap();
    QVariantMap client = clientMap(project);
    if (!opts.value(QStringLiteral("clientName")).toString().isEmpty()
        && client.value(QStringLiteral("name")).toString().isEmpty())
        client.insert(QStringLiteral("name"), opts.value(QStringLiteral("clientName")));

    const QVariantMap form = project.value(QStringLiteral("formState")).toMap();
    const QVariantMap loc = project.value(QStringLiteral("location")).toMap();
    const QVariantMap sizing = project.value(QStringLiteral("sizingResult")).toMap()
                                   .value(QStringLiteral("best")).toMap();
    const QVariantMap grid = project.value(QStringLiteral("gridResult")).toMap();
    const QVariantMap off = project.value(QStringLiteral("offgridResult")).toMap()
                                .value(QStringLiteral("best")).toMap();

    double tvaRate = opts.value(QStringLiteral("tvaRate"),
                                qmeta.value(QStringLiteral("tva"), 0.10)).toDouble();
    if (tvaRate > 1.0)
        tvaRate /= 100.0;
    const double remisePct = opts.value(QStringLiteral("remisePct"),
                                        qmeta.value(QStringLiteral("remise"), 0)).toDouble();
    const int validity = opts.value(QStringLiteral("validityDays"), 30).toInt();
    const QString notes = opts.value(QStringLiteral("notes"),
                                     qmeta.value(QStringLiteral("notes"))).toString();
    const QString ref = opts.value(QStringLiteral("ref")).toString().isEmpty()
                            ? makeRef()
                            : opts.value(QStringLiteral("ref")).toString();
    const QString title = opts.value(QStringLiteral("title")).toString().isEmpty()
                              ? QStringLiteral("DEVIS")
                              : opts.value(QStringLiteral("title")).toString();

    const QString path = docsDir() + QStringLiteral("/devis_")
                         + ref + QStringLiteral("_")
                         + QDate::currentDate().toString(QStringLiteral("yyyyMMdd"))
                         + QStringLiteral(".pdf");

    QPdfWriter writer(path);
    writer.setTitle(QStringLiteral("Devis %1").arg(ref));
    writer.setCreator(QStringLiteral("Open Solar Energy"));
    writer.setPageSize(QPageSize(QPageSize::A4));
    writer.setResolution(120);

    QPainter painter(&writer);
    if (!painter.isActive())
        return {};

    PdfCtx c;
    c.begin(&writer, &painter);
    int pageNo = 1;

    // ── En-tête ──
    c.setFont(18, true);
    c.p->setPen(kPrimary);
    c.p->drawText(c.margin, c.y + 18, QStringLiteral("Open Solar Energy"));
    c.setFont(8);
    c.p->setPen(kAccent);
    c.p->drawText(c.margin, c.y + 34, QStringLiteral("Dimensionnement & devis photovoltaïque"));

    const int rightX = c.margin + c.contentW * 55 / 100;
    c.setFont(8);
    c.p->setPen(kText);
    int ry = c.y + 12;
    auto rightLine = [&](const QString& s) {
        if (s.isEmpty())
            return;
        c.p->drawText(rightX, ry, s);
        ry += 12;
    };
    rightLine(installer.value(QStringLiteral("name")).toString());
    rightLine(installer.value(QStringLiteral("address")).toString());
    if (!installer.value(QStringLiteral("siret")).toString().isEmpty())
        rightLine(QStringLiteral("SIRET %1").arg(installer.value(QStringLiteral("siret")).toString()));
    if (!installer.value(QStringLiteral("rge")).toString().isEmpty())
        rightLine(QStringLiteral("Qualifié RGE n° %1").arg(installer.value(QStringLiteral("rge")).toString()));
    if (!installer.value(QStringLiteral("phone")).toString().isEmpty())
        rightLine(installer.value(QStringLiteral("phone")).toString());
    if (!installer.value(QStringLiteral("email")).toString().isEmpty())
        rightLine(installer.value(QStringLiteral("email")).toString());

    c.y = std::max(c.y + 48, ry + 8);
    c.p->setPen(QPen(kPrimary, 3));
    c.p->drawLine(c.margin, c.y, c.margin + c.contentW, c.y);
    c.y += 22;

    c.setFont(20, true);
    c.p->setPen(kPrimary);
    const QString head = title.toUpper();
    const int tw = c.p->fontMetrics().horizontalAdvance(head);
    c.p->drawText(c.margin + (c.contentW - tw) / 2, c.y, head);
    c.y += 18;
    c.setFont(9);
    c.p->setPen(kMuted);
    const QString sub = QStringLiteral("Réf. %1  ·  Établi le %2")
                            .arg(ref, fr().toString(QDate::currentDate(), QLocale::ShortFormat));
    const int sw = c.p->fontMetrics().horizontalAdvance(sub);
    c.p->drawText(c.margin + (c.contentW - sw) / 2, c.y, sub);
    c.y += 22;

    // ── 3 blocs ──
    const int gap = 10;
    const int bw = (c.contentW - 2 * gap) / 3;
    const int boxTop = c.y;
    int boxH = 110;

    auto drawPartyBox = [&](int x, const QString& title, const QStringList& linesIn) {
        c.boxHeader(title, x, bw);
        c.setFont(8);
        c.p->setPen(kText);
        int yy = boxTop + 28;
        for (const QString& line : linesIn) {
            if (line.isEmpty())
                continue;
            c.p->drawText(QRect(x + 6, yy, bw - 12, 40), Qt::TextWordWrap, line);
            yy += c.p->fontMetrics().boundingRect(QRect(0, 0, bw - 12, 40), Qt::TextWordWrap, line).height()
                  + 2;
        }
        boxH = std::max(boxH, yy - boxTop + 8);
    };

    QStringList clientLines{
        client.value(QStringLiteral("name")).toString(),
        client.value(QStringLiteral("address")).toString(),
        QStringLiteral("%1 %2")
            .arg(client.value(QStringLiteral("zip")).toString(),
                 client.value(QStringLiteral("city")).toString())
            .trimmed(),
        client.value(QStringLiteral("phone")).toString(),
        client.value(QStringLiteral("email")).toString(),
    };
    if (clientLines.join(QString()).trimmed().isEmpty())
        clientLines = {opts.value(QStringLiteral("clientName")).toString().isEmpty()
                           ? QStringLiteral("—")
                           : opts.value(QStringLiteral("clientName")).toString()};

    const double ppeak = form.value(QStringLiteral("Ppeak"),
                                    sizing.value(QStringLiteral("Ppeak"),
                                                 off.value(QStringLiteral("Ppeak"), 0))).toDouble();
    const double eAnnual = grid.value(QStringLiteral("E_annual"),
                                      sizing.value(QStringLiteral("E_annual"), 0)).toDouble();
    const double batt = form.value(QStringLiteral("battKwh"),
                                   off.value(QStringLiteral("battKwh"), 0)).toDouble();

    QStringList siteLines{
        loc.value(QStringLiteral("name")).toString(),
        (loc.contains(QStringLiteral("lat"))
             ? QStringLiteral("%1°, %2°")
                   .arg(loc.value(QStringLiteral("lat")).toDouble(), 0, 'f', 4)
                   .arg(loc.value(QStringLiteral("lon")).toDouble(), 0, 'f', 4)
             : QString()),
        installLabel(project.value(QStringLiteral("installType")).toString()),
        QStringLiteral("Tilt %1° / Azimut %2°")
            .arg(form.value(QStringLiteral("tilt"), 30).toDouble(), 0, 'f', 0)
            .arg(form.value(QStringLiteral("azimuth"), 0).toDouble(), 0, 'f', 0),
    };

    QStringList sysLines{
        ppeak > 0 ? QStringLiteral("Puissance : %1 kWc").arg(num(ppeak, 1)) : QString(),
        !form.value(QStringLiteral("panelModel")).toString().isEmpty()
            ? QStringLiteral("Modules : %1").arg(form.value(QStringLiteral("panelModel")).toString())
            : QString(),
        !form.value(QStringLiteral("inverterModel")).toString().isEmpty()
            ? QStringLiteral("Onduleur : %1").arg(form.value(QStringLiteral("inverterModel")).toString())
            : QString(),
        batt > 0 ? QStringLiteral("Stockage : %1 kWh").arg(num(batt, 1)) : QString(),
        eAnnual > 0 ? QStringLiteral("Prod. estimée : %1 kWh/an").arg(num(eAnnual, 0)) : QString(),
    };

    drawPartyBox(c.margin, QStringLiteral("CLIENT"), clientLines);
    drawPartyBox(c.margin + bw + gap, QStringLiteral("CHANTIER"), siteLines);
    drawPartyBox(c.margin + 2 * (bw + gap), QStringLiteral("SYSTÈME PV"), sysLines);

    for (int i = 0; i < 3; ++i) {
        const int x = c.margin + i * (bw + gap);
        c.p->setPen(kLine);
        c.p->drawRect(QRect(x, boxTop, bw, boxH));
    }
    c.y = boxTop + boxH + 18;

    // ── Tableau des lignes ──
    c.h2(QStringLiteral("Prestations"));

    const int colDes = c.margin;
    const int colQty = c.margin + int(c.contentW * 0.52);
    const int colUnit = c.margin + int(c.contentW * 0.62);
    const int colPu = c.margin + int(c.contentW * 0.74);
    const int colHt = c.margin + int(c.contentW * 0.88);

    auto drawTableHeader = [&]() {
        c.ensure(22);
        c.p->fillRect(QRect(c.margin, c.y - 12, c.contentW, 18), kPrimary);
        c.setFont(8, true);
        c.p->setPen(Qt::white);
        c.p->drawText(colDes + 4, c.y, QStringLiteral("Désignation"));
        c.p->drawText(colQty, c.y, QStringLiteral("Qté"));
        c.p->drawText(colUnit, c.y, QStringLiteral("Unité"));
        c.p->drawText(colPu, c.y, QStringLiteral("P.U. HT"));
        c.p->drawText(colHt, c.y, QStringLiteral("Total HT"));
        c.y += 14;
    };
    drawTableHeader();

    double subtotal = 0;
    int row = 0;
    for (const QVariant& v : lines) {
        const QVariantMap m = v.toMap();
        if (m.value(QStringLiteral("note")).toBool() && m.value(QStringLiteral("amount")).toDouble() <= 0)
            continue;
        const QString label = m.value(QStringLiteral("label")).toString();
        const double amount = m.value(QStringLiteral("amount")).toDouble();
        const double qty = m.value(QStringLiteral("qty")).toDouble() > 0
                               ? m.value(QStringLiteral("qty")).toDouble()
                               : 1.0;
        const QString unit = m.value(QStringLiteral("unit")).toString().isEmpty()
                                 ? QStringLiteral("ens.")
                                 : m.value(QStringLiteral("unit")).toString();
        const double pu = qty > 0 ? amount / qty : amount;
        subtotal += amount;

        c.ensure(20);
        if (c.y > c.pageH - c.margin - 40) {
            drawFooter(c, QStringLiteral("Devis %1").arg(ref), pageNo++);
            c.newPage();
            drawTableHeader();
        }
        if (row % 2 == 0)
            c.p->fillRect(QRect(c.margin, c.y - 11, c.contentW, 16), QColor(0xf4, 0xf7, 0xf5));
        c.setFont(8);
        c.p->setPen(kText);
        c.p->drawText(QRect(colDes + 4, c.y - 11, colQty - colDes - 8, 16),
                      Qt::AlignVCenter | Qt::TextSingleLine, label);
        c.p->drawText(colQty, c.y, num(qty, qty == std::floor(qty) ? 0 : 1));
        c.p->drawText(colUnit, c.y, unit.left(12));
        c.p->drawText(colPu, c.y, euro(pu));
        c.p->drawText(colHt, c.y, euro(amount));
        c.y += 16;
        ++row;
    }

    const double remise = subtotal * (remisePct / 100.0);
    const double baseHt = subtotal - remise;
    const double tva = baseHt * tvaRate;
    const double ttc = baseHt + tva;

    c.y += 8;
    c.ensure(110);
    const int totX = c.margin + c.contentW - 260;
    c.p->setPen(kLine);
    c.p->drawRect(QRect(totX, c.y, 260, remisePct > 0 ? 88 : 72));
    c.setFont(9);
    int ty = c.y + 16;
    auto totLine = [&](const QString& k, const QString& v, bool bold = false, bool accent = false) {
        c.setFont(9, bold);
        c.p->setPen(accent ? Qt::white : kText);
        if (accent)
            c.p->fillRect(QRect(totX + 1, ty - 12, 258, 18), kPrimary);
        c.p->drawText(totX + 10, ty, k);
        const int vw = c.p->fontMetrics().horizontalAdvance(v);
        c.p->drawText(totX + 250 - vw, ty, v);
        ty += 18;
    };
    totLine(QStringLiteral("Sous-total HT"), euro(subtotal));
    if (remisePct > 0)
        totLine(QStringLiteral("Remise (%1 %)").arg(num(remisePct, 0)),
                QStringLiteral("− %1").arg(euro(remise)));
    totLine(QStringLiteral("Base HT"), euro(baseHt), true);
    totLine(QStringLiteral("TVA (%1 %)").arg(num(tvaRate * 100, tvaRate * 100 == std::floor(tvaRate * 100) ? 0 : 1)),
            euro(tva));
    totLine(QStringLiteral("TOTAL TTC"), euro(ttc), true, true);
    c.y = ty + 16;

    // Validité + mentions
    c.ensure(40);
    c.p->fillRect(QRect(c.margin, c.y, c.contentW, 24), QColor(0xff, 0xf8, 0xe1));
    c.p->setPen(QColor(0xf9, 0xa8, 0x25));
    c.p->drawRect(QRect(c.margin, c.y, c.contentW, 24));
    c.setFont(8);
    c.p->setPen(kText);
    c.p->drawText(c.margin + 8, c.y + 16,
                  QStringLiteral("Devis valable %1 jours à compter du %2 — Offre non constitutive d’un contrat avant acceptation.")
                      .arg(validity)
                      .arg(fr().toString(QDate::currentDate(), QLocale::ShortFormat)));
    c.y += 36;

    c.para(QStringLiteral(
               "Mentions : prix exprimés en euros HT. TVA applicable selon la nature des travaux "
               "(souvent 10 % pour rénovation énergétique éligible, 20 % sinon — à confirmer par l’installateur). "
               "Matériel sous garantie constructeur. Pose et mise en service selon DTU / normes en vigueur. "
               "Délais et modalités de paiement à préciser à la commande."),
           7, kMuted);

    if (!notes.isEmpty()) {
        c.h2(QStringLiteral("Notes et conditions"));
        c.para(notes, 8);
    }

    // Annexes notes from lines
    QStringList annex;
    for (const QVariant& v : lines) {
        const QVariantMap m = v.toMap();
        if (m.value(QStringLiteral("note")).toBool())
            annex.append(m.value(QStringLiteral("label")).toString());
    }
    if (!annex.isEmpty()) {
        c.h2(QStringLiteral("Annexes informatives"));
        for (const QString& a : annex)
            c.para(QStringLiteral("• %1").arg(a), 8, kMuted);
    }

    c.ensure(70);
    c.setFont(9, true);
    c.p->setPen(kText);
    c.p->drawText(c.margin, c.y, QStringLiteral("Bon pour accord — Signature du client"));
    c.y += 10;
    c.p->setPen(kLine);
    c.p->drawLine(c.margin, c.y + 36, c.margin + c.contentW * 55 / 100, c.y + 36);
    c.y += 50;

    drawFooter(c, QStringLiteral("Devis %1").arg(ref), pageNo);
    painter.end();
    return path;
}

QString PdfExport::exportSimulationReport(const QVariantMap& project)
{
    const QVariantMap form = project.value(QStringLiteral("formState")).toMap();
    const QVariantMap loc = project.value(QStringLiteral("location")).toMap();
    const QVariantMap weatherMeta = project.value(QStringLiteral("weatherMeta")).toMap();
    const QVariantList weather = project.value(QStringLiteral("weatherData")).toList();
    const QVariantMap site = project.value(QStringLiteral("siteSurvey")).toMap();
    const QVariantMap sizingRoot = project.value(QStringLiteral("sizingResult")).toMap();
    const QVariantMap sizing = sizingRoot.value(QStringLiteral("best")).toMap();
    const QVariantMap grid = project.value(QStringLiteral("gridResult")).toMap();
    const QVariantMap offRoot = project.value(QStringLiteral("offgridResult")).toMap();
    const QVariantMap off = offRoot.value(QStringLiteral("best")).toMap();
    const QVariantMap cable = project.value(QStringLiteral("cableResult")).toMap();
    const QString name = project.value(QStringLiteral("name")).toString().isEmpty()
                             ? QStringLiteral("Projet PV")
                             : project.value(QStringLiteral("name")).toString();
    const QString install = project.value(QStringLiteral("installType")).toString();

    const QString path = docsDir() + QStringLiteral("/rapport_")
                         + name.toLower().replace(QRegularExpression(QStringLiteral("[^a-z0-9]+")),
                                                  QStringLiteral("_")).left(40)
                         + QStringLiteral("_")
                         + QDate::currentDate().toString(QStringLiteral("yyyyMMdd"))
                         + QStringLiteral(".pdf");

    QPdfWriter writer(path);
    writer.setTitle(QStringLiteral("Rapport de simulation — %1").arg(name));
    writer.setCreator(QStringLiteral("Open Solar Energy"));
    writer.setPageSize(QPageSize(QPageSize::A4));
    writer.setResolution(120);

    QPainter painter(&writer);
    if (!painter.isActive())
        return {};

    PdfCtx c;
    c.begin(&writer, &painter);
    int pageNo = 1;

    auto endPage = [&]() {
        drawFooter(c, QStringLiteral("Rapport %1").arg(name), pageNo++);
        c.newPage();
    };

    // ── Couverture ──
    c.y = c.pageH / 4;
    c.setFont(11);
    c.p->setPen(kMuted);
    c.p->drawText(c.margin, c.y, QStringLiteral("RAPPORT DE SIMULATION PHOTOVOLTAÏQUE"));
    c.y += 28;
    c.setFont(22, true);
    c.p->setPen(kPrimary);
    c.p->drawText(c.margin, c.y, name);
    c.y += 28;
    c.setFont(11);
    c.p->setPen(kText);
    c.para(QStringLiteral("Client : %1").arg(clientName(project).isEmpty() ? QStringLiteral("—")
                                                                          : clientName(project)),
           11);
    c.para(QStringLiteral("Lieu : %1").arg(loc.value(QStringLiteral("name")).toString().isEmpty()
                                               ? QStringLiteral("—")
                                               : loc.value(QStringLiteral("name")).toString()),
           11);
    c.para(QStringLiteral("Type : %1").arg(installLabel(install)), 11);
    c.para(QStringLiteral("Date : %1").arg(fr().toString(QDate::currentDate(), QLocale::LongFormat)), 11);
    c.y += 20;
    c.para(QStringLiteral(
               "Document technique généré par Open Solar Energy. "
               "Les résultats sont issus de modèles de transposition / production PV "
               "(approche type étude de productible). Ils ne remplacent pas une étude "
               "réglementaire ou un dossier Consuel / Enedis."),
           8, kMuted);
    endPage();

    // ── 1. Site ──
    c.h1(QStringLiteral("1. Identification du site"));
    c.kv(QStringLiteral("Nom / adresse"), loc.value(QStringLiteral("name")).toString());
    c.kv(QStringLiteral("Latitude"),
         QStringLiteral("%1 °").arg(loc.value(QStringLiteral("lat")).toDouble(), 0, 'f', 5));
    c.kv(QStringLiteral("Longitude"),
         QStringLiteral("%1 °").arg(loc.value(QStringLiteral("lon")).toDouble(), 0, 'f', 5));
    c.kv(QStringLiteral("Altitude (si connue)"),
         loc.contains(QStringLiteral("alt"))
             ? QStringLiteral("%1 m").arg(loc.value(QStringLiteral("alt")).toDouble(), 0, 'f', 0)
             : QStringLiteral("—"));
    c.kv(QStringLiteral("Fuseau / contexte"), QStringLiteral("France métropolitaine (indicatif)"));
    c.y += 8;
    c.h2(QStringLiteral("Orientation du champ PV"));
    c.kv(QStringLiteral("Inclinaison (tilt)"),
         QStringLiteral("%1 °").arg(form.value(QStringLiteral("tilt"), 30).toDouble(), 0, 'f', 1));
    c.kv(QStringLiteral("Azimut (0 = Sud)"),
         QStringLiteral("%1 °").arg(form.value(QStringLiteral("azimuth"), 0).toDouble(), 0, 'f', 1));
    c.kv(QStringLiteral("Pertes système (hors ombrage)"),
         QStringLiteral("%1 %").arg(form.value(QStringLiteral("losses"), 14).toDouble(), 0, 'f', 1));

    // ── 2. Météo ──
    c.h1(QStringLiteral("2. Données météorologiques"));
    c.kv(QStringLiteral("Source"),
         weatherMeta.value(QStringLiteral("source")).toString().isEmpty()
             ? QStringLiteral("—")
             : weatherMeta.value(QStringLiteral("source")).toString());
    c.kv(QStringLiteral("Nombre de mois"), QString::number(weather.size()));
    if (!weather.isEmpty()) {
        c.y += 6;
        c.h2(QStringLiteral("Irradiation horizontale (GHI) mensuelle"));
        c.ensure(20);
        c.setFont(8, true);
        c.p->setPen(kPrimary);
        c.p->drawText(c.margin, c.y, QStringLiteral("Mois"));
        c.p->drawText(c.margin + 80, c.y, QStringLiteral("GHI (kWh/m²)"));
        c.p->drawText(c.margin + 200, c.y, QStringLiteral("DHI"));
        c.p->drawText(c.margin + 280, c.y, QStringLiteral("Temp. (°C)"));
        c.y += 14;
        static const char* months[] = {"Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
                                       "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"};
        double sumG = 0;
        for (int i = 0; i < weather.size() && i < 12; ++i) {
            const QVariantMap w = weather[i].toMap();
            const double ghi = w.value(QStringLiteral("GHI")).toDouble();
            sumG += ghi;
            c.ensure(14);
            c.setFont(8);
            c.p->setPen(kText);
            c.p->drawText(c.margin, c.y, QString::fromUtf8(months[i]));
            c.p->drawText(c.margin + 80, c.y, num(ghi, 1));
            c.p->drawText(c.margin + 200, c.y, num(w.value(QStringLiteral("DHI")).toDouble(), 1));
            c.p->drawText(c.margin + 280, c.y, num(w.value(QStringLiteral("temp")).toDouble(), 1));
            c.y += 13;
        }
        c.y += 4;
        c.kv(QStringLiteral("GHI annuelle"), QStringLiteral("%1 kWh/m²").arg(num(sumG, 0)));
    }

    // ── 3. Ombrage ──
    c.h1(QStringLiteral("3. Ombrages & horizon"));
    const double shade = site.value(QStringLiteral("annualLossPct")).toDouble();
    c.kv(QStringLiteral("Perte beam annuelle estimée"),
         shade > 0 ? QStringLiteral("%1 %").arg(num(shade, 1)) : QStringLiteral("Non renseigné"));
    c.kv(QStringLiteral("Points d’horizon"),
         QString::number(site.value(QStringLiteral("points")).toList().size()));
    c.para(QStringLiteral(
               "L’ombrage proche / horizon est appliqué via facteurs mensuels (ou profil 30 min) "
               "lors du dimensionnement et des simulations horaires. "
               "Une étude PVsyst complète inclurait aussi l’albedo, les ombrages portés 3D détaillés "
               "et le diagramme de pertes (IAM, mismatch, onduleur, câbles…)."),
           8, kMuted);

    // ── 4. Système ──
    endPage();
    c.h1(QStringLiteral("4. Définition du système"));
    const double ppeak = form.value(QStringLiteral("Ppeak"),
                                    sizing.value(QStringLiteral("Ppeak"),
                                                 off.value(QStringLiteral("Ppeak"), 0))).toDouble();
    const double panelWp = form.value(QStringLiteral("panelWp"), 400).toDouble();
    const int nPanels = panelWp > 0 ? int(std::lround(ppeak * 1000.0 / panelWp)) : 0;
    c.kv(QStringLiteral("Puissance crête"), QStringLiteral("%1 kWc").arg(num(ppeak, 2)));
    c.kv(QStringLiteral("Modules"),
         QStringLiteral("%1 × %2 Wc — %3")
             .arg(nPanels)
             .arg(num(panelWp, 0))
             .arg(form.value(QStringLiteral("panelModel")).toString().isEmpty()
                      ? QStringLiteral("module générique")
                      : form.value(QStringLiteral("panelModel")).toString()));
    c.kv(QStringLiteral("Onduleur"),
         form.value(QStringLiteral("inverterModel")).toString().isEmpty()
             ? QStringLiteral("—")
             : form.value(QStringLiteral("inverterModel")).toString());
    c.kv(QStringLiteral("Stockage"),
         form.value(QStringLiteral("battKwh")).toDouble() > 0
             ? QStringLiteral("%1 kWh (DoD %2 %)")
                   .arg(num(form.value(QStringLiteral("battKwh")).toDouble(), 1))
                   .arg(num(form.value(QStringLiteral("battDod"),
                                       form.value(QStringLiteral("dod"), 80)).toDouble(),
                            0))
             : QStringLiteral("Sans batterie"));
    if (!cable.isEmpty()) {
        c.y += 6;
        c.h2(QStringLiteral("Câblage (indicatif)"));
        c.kv(QStringLiteral("Section proposée"),
             QStringLiteral("%1 mm²").arg(cable.value(QStringLiteral("sectionMm2")).toString()));
        c.kv(QStringLiteral("Chute de tension"),
             QStringLiteral("%1 %").arg(num(cable.value(QStringLiteral("voltageDropPct")).toDouble(), 2)));
    }

    // ── 5. Résultats énergétiques ──
    c.h1(QStringLiteral("5. Résultats de simulation"));
    const double eAnnual = grid.value(QStringLiteral("E_annual"),
                                      sizing.value(QStringLiteral("E_annual"), 0)).toDouble();
    c.kv(QStringLiteral("Production annuelle"),
         eAnnual > 0 ? QStringLiteral("%1 kWh/an").arg(num(eAnnual, 0)) : QStringLiteral("—"));
    if (ppeak > 0 && eAnnual > 0)
        c.kv(QStringLiteral("Productible spécifique"),
             QStringLiteral("%1 kWh/kWc/an").arg(num(eAnnual / ppeak, 0)));
    if (sizing.contains(QStringLiteral("autoconsoRate")))
        c.kv(QStringLiteral("Taux d’autoconsommation"),
             QStringLiteral("%1 %").arg(num(sizing.value(QStringLiteral("autoconsoRate")).toDouble(), 1)));
    if (sizing.contains(QStringLiteral("coverageRate")))
        c.kv(QStringLiteral("Taux de couverture"),
             QStringLiteral("%1 %").arg(num(sizing.value(QStringLiteral("coverageRate")).toDouble(), 1)));
    if (sizing.contains(QStringLiteral("annualAutoconsoKwh")))
        c.kv(QStringLiteral("Énergie autoconsommée"),
             QStringLiteral("%1 kWh/an")
                 .arg(num(sizing.value(QStringLiteral("annualAutoconsoKwh")).toDouble(), 0)));

    // Monthly from sizing or grid
    QVariantList monthly = sizing.value(QStringLiteral("monthly")).toList();
    if (monthly.isEmpty())
        monthly = grid.value(QStringLiteral("monthly")).toList();
    QVariantList monthlyMetrics = sizingRoot.value(QStringLiteral("monthlyMetrics")).toList();
    if (monthlyMetrics.isEmpty())
        monthlyMetrics = sizing.value(QStringLiteral("monthlyMetrics")).toList();

    c.y += 8;
    c.h2(QStringLiteral("Bilan mensuel"));
    c.ensure(20);
    c.setFont(8, true);
    c.p->setPen(kPrimary);
    c.p->drawText(c.margin, c.y, QStringLiteral("Mois"));
    c.p->drawText(c.margin + 70, c.y, QStringLiteral("Prod (kWh)"));
    c.p->drawText(c.margin + 160, c.y, QStringLiteral("Conso"));
    c.p->drawText(c.margin + 240, c.y, QStringLiteral("Autoconso"));
    c.p->drawText(c.margin + 340, c.y, QStringLiteral("Surplus"));
    c.y += 14;
    static const char* monthsFr[] = {"Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
                                     "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"};
    for (int i = 0; i < 12; ++i) {
        c.ensure(14);
        double prod = 0, conso = 0, autoC = 0, surplus = 0;
        if (i < monthlyMetrics.size()) {
            const QVariantMap m = monthlyMetrics[i].toMap();
            prod = m.value(QStringLiteral("prod")).toDouble();
            conso = m.value(QStringLiteral("conso")).toDouble();
            autoC = m.value(QStringLiteral("autoconsoKwh")).toDouble();
            surplus = m.value(QStringLiteral("surplus")).toDouble();
        } else if (i < monthly.size()) {
            const QVariant mv = monthly[i];
            if (mv.typeId() == QMetaType::QVariantMap)
                prod = mv.toMap().value(QStringLiteral("E")).toDouble();
            else
                prod = mv.toDouble();
        }
        c.setFont(8);
        c.p->setPen(kText);
        c.p->drawText(c.margin, c.y, QString::fromUtf8(monthsFr[i]));
        c.p->drawText(c.margin + 70, c.y, num(prod, 0));
        c.p->drawText(c.margin + 160, c.y, conso > 0 ? num(conso, 0) : QStringLiteral("—"));
        c.p->drawText(c.margin + 240, c.y, autoC > 0 ? num(autoC, 0) : QStringLiteral("—"));
        c.p->drawText(c.margin + 340, c.y, surplus > 0 ? num(surplus, 0) : QStringLiteral("—"));
        c.y += 13;
    }

    // ── 6. Finances ──
    endPage();
    c.h1(QStringLiteral("6. Évaluation économique"));
    const double cost = form.value(QStringLiteral("systemCost"),
                                   sizing.value(QStringLiteral("systemCost"), ppeak * 1200)).toDouble();
    c.kv(QStringLiteral("Investissement estimé"), euro(cost));
    if (sizing.contains(QStringLiteral("paybackYears")) || sizing.contains(QStringLiteral("payback")))
        c.kv(QStringLiteral("Temps de retour"),
             QStringLiteral("%1 ans")
                 .arg(num(sizing.value(QStringLiteral("paybackYears"),
                                       sizing.value(QStringLiteral("payback")))
                              .toDouble(),
                          1)));
    if (sizing.contains(QStringLiteral("npv")) || sizing.contains(QStringLiteral("npv25")))
        c.kv(QStringLiteral("VAN"),
             euro(sizing.value(QStringLiteral("npv25"), sizing.value(QStringLiteral("npv"))).toDouble()));
    if (sizing.contains(QStringLiteral("lcoe")))
        c.kv(QStringLiteral("LCOE"),
             QStringLiteral("%1 €/kWh").arg(num(sizing.value(QStringLiteral("lcoe")).toDouble(), 3)));
    if (sizing.contains(QStringLiteral("incentive")))
        c.kv(QStringLiteral("Prime / aides (estim.)"),
             euro(sizing.value(QStringLiteral("incentive")).toDouble()));
    if (grid.contains(QStringLiteral("payback")))
        c.kv(QStringLiteral("Payback (simul. réseau)"),
             QStringLiteral("%1 ans").arg(num(grid.value(QStringLiteral("payback")).toDouble(), 1)));
    c.para(QStringLiteral(
               "Hypothèses économiques simplifiées (tarif, inflation, dégradation modules ~0,5 %/an). "
               "À affiner avec le devis commercial et le régime d’obligation d’achat / autoconsommation."),
           8, kMuted);

    // ── 7. Hors réseau ──
    if (!off.isEmpty() || install == QLatin1String("offgrid") || install == QLatin1String("hybrid")) {
        c.h1(QStringLiteral("7. Simulation hors réseau / stockage"));
        if (!off.isEmpty()) {
            c.kv(QStringLiteral("Ppeak recommandé"),
                 QStringLiteral("%1 kWc").arg(num(off.value(QStringLiteral("Ppeak")).toDouble(), 2)));
            c.kv(QStringLiteral("Batterie"),
                 QStringLiteral("%1 kWh").arg(num(off.value(QStringLiteral("battKwh")).toDouble(), 1)));
            if (off.contains(QStringLiteral("coverage")) || off.contains(QStringLiteral("coveragePct")))
                c.kv(QStringLiteral("Couverture"),
                     QStringLiteral("%1 %")
                         .arg(num(off.value(QStringLiteral("coveragePct"),
                                            off.value(QStringLiteral("coverage")))
                                      .toDouble(),
                                  1)));
            if (off.contains(QStringLiteral("cost")))
                c.kv(QStringLiteral("Coût estimé"), euro(off.value(QStringLiteral("cost")).toDouble()));
        } else {
            c.para(QStringLiteral("Aucun résultat hors réseau enregistré — lancez l’onglet Hors réseau."),
                   9, kMuted);
        }
    }

    // ── 8. Méthode ──
    c.h1(QStringLiteral("8. Méthode & limites (équivalent notice PVsyst)"));
    c.para(QStringLiteral(
               "• Irradiation : séries mensuelles (Open-Meteo / PVGIS / démo) transposées sur plan incliné.\n"
               "• Production : modèle PV cristallin avec pertes système forfaitaires + ombrage site.\n"
               "• Autoconsommation : profil de charge mensuel / jour-nuit (Enedis si importé).\n"
               "• Hors réseau : simulation horaire / 30 min avec batterie et critères de couverture.\n"
               "• Non inclus au niveau PVsyst Pro : 3D shading détaillé module-par-module, "
               "thermal model avancé, aging multi-années complet, onduleur clipping courbe, "
               "normes IEC détaillées, import Meteonorm payant."),
           8, kMuted);

    c.y += 12;
    c.para(QStringLiteral("Fin du rapport — Open Solar Energy %1")
               .arg(QStringLiteral(OSE_APP_VERSION)),
           8, kMuted);
    drawFooter(c, QStringLiteral("Rapport %1").arg(name), pageNo);
    painter.end();
    return path;
}

QVariantList PdfExport::previewPages(const QString& pdfPath, int maxPages) const
{
    QVariantList out;
    if (pdfPath.isEmpty() || !QFileInfo::exists(pdfPath))
        return out;

    QPdfDocument doc;
    if (doc.load(pdfPath) != QPdfDocument::Error::None)
        return out;

    const int n = std::min(doc.pageCount(), std::max(1, maxPages));
    const QString tmp = QStandardPaths::writableLocation(QStandardPaths::TempLocation)
                        + QStringLiteral("/ose-pdf-preview");
    QDir().mkpath(tmp);

    for (int i = 0; i < n; ++i) {
        const QSizeF pt = doc.pagePointSize(i);
        // ~150 dpi preview
        const int w = int(pt.width() / 72.0 * 120);
        const int h = int(pt.height() / 72.0 * 120);
        const QImage img = doc.render(i, QSize(w, h));
        if (img.isNull())
            continue;
        const QString pagePath = tmp + QStringLiteral("/page_%1.png").arg(i);
        img.save(pagePath, "PNG");
        out.append(QVariantMap{
            {QStringLiteral("page"), i + 1},
            {QStringLiteral("path"), pagePath},
            {QStringLiteral("url"), QUrl::fromLocalFile(pagePath).toString()},
            {QStringLiteral("width"), w},
            {QStringLiteral("height"), h},
        });
    }
    return out;
}

bool PdfExport::openPdf(const QString& path) const
{
    if (path.isEmpty() || !QFileInfo::exists(path))
        return false;
    return QDesktopServices::openUrl(QUrl::fromLocalFile(path));
}

} // namespace ose
