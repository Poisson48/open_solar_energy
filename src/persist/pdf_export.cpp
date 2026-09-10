#include "pdf_export.h"

#include "core/year_pv.h"

#include <QDate>
#include <QDateTime>
#include <QDesktopServices>
#include <QDir>
#include <QFileInfo>
#include <QFont>
#include <QLocale>
#include <QPageSize>
#include <QPainter>
#include <QPdfWriter>
#include <QRegularExpression>
#include <QStandardPaths>
#include <QUrl>
#include <algorithm>
#include <cmath>

#ifdef OSE_HAS_QPDFDOCUMENT
#  include <QPdfDocument>
#endif

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
    const QVariantMap pvgis = project.value(QStringLiteral("pvgisPvcalc")).toMap();
    const QString name = project.value(QStringLiteral("name")).toString().isEmpty()
                             ? QStringLiteral("Projet PV")
                             : project.value(QStringLiteral("name")).toString();
    const QString install = project.value(QStringLiteral("installType")).toString();

    const double ppeak = form.value(QStringLiteral("Ppeak"),
                                    sizing.value(QStringLiteral("Ppeak"),
                                                 off.value(QStringLiteral("Ppeak"), 3)))
                             .toDouble();
    const double panelWp = form.value(QStringLiteral("panelWp"), 400).toDouble();
    const int nPanels = panelWp > 0 ? int(std::lround(ppeak * 1000.0 / panelWp)) : 0;
    const double panelArea = form.value(QStringLiteral("panelArea"), 2.0).toDouble();

    QVariantMap balances = project.value(QStringLiteral("pvsystBalances")).toMap();
    if (!balances.value(QStringLiteral("ok")).toBool() && !weather.isEmpty()) {
        QVariantMap bp{
            {QStringLiteral("lat"), loc.value(QStringLiteral("lat"), 43.6)},
            {QStringLiteral("tilt"), form.value(QStringLiteral("tilt"), 30)},
            {QStringLiteral("azimuth"), form.value(QStringLiteral("azimuth"), 0)},
            {QStringLiteral("Ppeak"), ppeak},
            {QStringLiteral("weatherData"), weather},
            {QStringLiteral("losses"), form.value(QStringLiteral("losses"), 14)},
            {QStringLiteral("halfHourlyKeep"), site.value(QStringLiteral("halfHourlyKeep"))},
            {QStringLiteral("monthlyLoss"), site.value(QStringLiteral("monthlyLoss"))},
            {QStringLiteral("annualLossPct"), site.value(QStringLiteral("annualLossPct"), 0)},
            {QStringLiteral("useElectricalShade"),
             form.value(QStringLiteral("energyMode")).toString() == QLatin1String("study")},
            {QStringLiteral("useInverterModel"), form.value(QStringLiteral("useInverterModel"), true)},
            {QStringLiteral("pacNom"), form.value(QStringLiteral("pacNom"), ppeak * 0.9)},
            {QStringLiteral("etaEuro"), form.value(QStringLiteral("etaEuro"), 0.97)},
        };
        if (form.contains(QStringLiteral("lossTree")))
            bp.insert(QStringLiteral("lossTree"), form.value(QStringLiteral("lossTree")));
        QVariantMap thermal = form.value(QStringLiteral("thermal")).toMap();
        if (thermal.isEmpty()) {
            thermal = {{QStringLiteral("model"),
                        form.value(QStringLiteral("energyMode")).toString() == QLatin1String("study")
                            ? QStringLiteral("uValue")
                            : QStringLiteral("noct")},
                       {QStringLiteral("U"), form.value(QStringLiteral("mountU"), 29)},
                       {QStringLiteral("wind"), form.value(QStringLiteral("wind"), 1)}};
        }
        bp.insert(QStringLiteral("thermal"), thermal);
        balances = YearPv::buildBalancesReport(bp);
    }
    const QVariantMap kpi = balances.value(QStringLiteral("kpi")).toMap();
    const QVariantList balMonths = balances.value(QStringLiteral("balancesMonthly")).toList();
    const QVariantList lossDiag = balances.value(QStringLiteral("lossDiagram")).toList();

    const QString path = docsDir() + QStringLiteral("/rapport_")
                         + name.toLower()
                               .replace(QRegularExpression(QStringLiteral("[^a-z0-9]+")),
                                        QStringLiteral("_"))
                               .left(40)
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

    auto drawMiniBars = [&](const QVariantList& months, const QString& key, const QString& title) {
        c.h2(title);
        c.ensure(90);
        double vmax = 1;
        for (const QVariant& v : months)
            vmax = std::max(vmax, v.toMap().value(key).toDouble());
        const int baseY = c.y + 70;
        const int barW = std::max(8, c.contentW / 14);
        for (int i = 0; i < months.size() && i < 12; ++i) {
            const double val = months[i].toMap().value(key).toDouble();
            const int h = int(std::round(val / vmax * 60));
            const int x = c.margin + i * (barW + 4);
            c.p->fillRect(QRect(x, baseY - h, barW, h), kPrimary);
            c.setFont(6);
            c.p->setPen(kMuted);
            c.p->drawText(x, baseY + 10, QString::number(i + 1));
        }
        c.y = baseY + 18;
    };

    // Couverture
    c.y = c.pageH / 5;
    c.setFont(11);
    c.p->setPen(kMuted);
    c.p->drawText(c.margin, c.y, QStringLiteral("RAPPORT DE SIMULATION PHOTOVOLTAÏQUE"));
    c.y += 12;
    c.setFont(9);
    c.p->drawText(c.margin, c.y,
                  QStringLiteral("Style étude PVsyst / IEC 61724 — Open Solar Energy %1")
                      .arg(QStringLiteral(OSE_APP_VERSION)));
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
    c.para(QStringLiteral("Type : %1 — %2 kWc").arg(installLabel(install)).arg(num(ppeak, 2)), 11);
    c.para(QStringLiteral("Date : %1").arg(fr().toString(QDate::currentDate(), QLocale::LongFormat)), 11);
    if (kpi.value(QStringLiteral("E_Grid_y")).toDouble() > 0) {
        c.y += 12;
        c.h2(QStringLiteral("Results summary"));
        c.kv(QStringLiteral("Produced Energy"),
             QStringLiteral("%1 kWh/year").arg(num(kpi.value(QStringLiteral("E_Grid_y")).toDouble(), 0)));
        c.kv(QStringLiteral("Specific production"),
             QStringLiteral("%1 kWh/kWp/year")
                 .arg(num(kpi.value(QStringLiteral("specificYield")).toDouble(), 0)));
        c.kv(QStringLiteral("Performance Ratio PR"),
             QStringLiteral("%1 %").arg(num(kpi.value(QStringLiteral("PR_pct")).toDouble(), 1)));
    }
    c.y += 16;
    c.para(QStringLiteral("Document technique Open Solar Energy — balances type PVsyst / IEC 61724. "
                          "Ne remplace pas une étude réglementaire Consuel / Enedis."),
           8, kMuted);
    endPage();

    // 1 Summary
    c.h1(QStringLiteral("1. Project & results summary"));
    c.h2(QStringLiteral("Geographical site"));
    c.kv(QStringLiteral("Name / address"), loc.value(QStringLiteral("name")).toString());
    c.kv(QStringLiteral("Latitude"),
         QStringLiteral("%1 °").arg(loc.value(QStringLiteral("lat")).toDouble(), 0, 'f', 5));
    c.kv(QStringLiteral("Longitude"),
         QStringLiteral("%1 °").arg(loc.value(QStringLiteral("lon")).toDouble(), 0, 'f', 5));
    const double alt = loc.value(QStringLiteral("alt"),
                                 form.value(QStringLiteral("terrainElev"),
                                            pvgis.value(QStringLiteral("elevation"), 0)))
                           .toDouble();
    c.kv(QStringLiteral("Altitude"), alt > 0 ? QStringLiteral("%1 m").arg(num(alt, 0)) : QStringLiteral("—"));
    c.kv(QStringLiteral("Time zone"), QStringLiteral("France métropolitaine (indicatif)"));

    c.h2(QStringLiteral("Meteo data"));
    c.kv(QStringLiteral("Source"),
         weatherMeta.value(QStringLiteral("source")).toString().isEmpty()
             ? QStringLiteral("—")
             : weatherMeta.value(QStringLiteral("source")).toString());
    const QVariantMap hourlyWx = project.value(QStringLiteral("hourlyWeatherData")).toMap();
    if (!hourlyWx.isEmpty()) {
        c.kv(QStringLiteral("Hourly TMY"),
             QStringLiteral("%1 — %2 h — year %3")
                 .arg(hourlyWx.value(QStringLiteral("source")).toString())
                 .arg(hourlyWx.value(QStringLiteral("nHours"),
                                     hourlyWx.value(QStringLiteral("ghi")).toList().size())
                          .toInt())
                 .arg(hourlyWx.value(QStringLiteral("year")).toInt()));
    }
    c.kv(QStringLiteral("Energy mode"),
         form.value(QStringLiteral("energyMode"), QStringLiteral("fast")).toString()
                 == QLatin1String("study")
             ? QStringLiteral("Study (hourly)")
             : QStringLiteral("Fast (monthly)"));

    c.h2(QStringLiteral("System summary"));
    c.kv(QStringLiteral("Orientation"),
         QStringLiteral("Tilt %1 ° / Azimuth %2 ° (0 = South)")
             .arg(num(form.value(QStringLiteral("tilt"), 30).toDouble(), 1))
             .arg(num(form.value(QStringLiteral("azimuth"), 0).toDouble(), 1)));
    c.kv(QStringLiteral("Near shadings"),
         site.value(QStringLiteral("annualLossPct")).toDouble() > 0
             ? QStringLiteral("Yes — annual beam loss ~%1 %")
                   .arg(num(site.value(QStringLiteral("annualLossPct")).toDouble(), 1))
             : QStringLiteral("None / not computed"));
    c.kv(QStringLiteral("PV modules"),
         QStringLiteral("%1 × %2 Wp (%3 kWp)").arg(nPanels).arg(num(panelWp, 0)).arg(num(ppeak, 2)));
    const double pac = form.value(QStringLiteral("pacNom"), ppeak * 0.9).toDouble();
    c.kv(QStringLiteral("Inverter"),
         form.value(QStringLiteral("inverterModel")).toString().isEmpty()
             ? QStringLiteral("Generic — Pnom ratio ~%1").arg(num(ppeak / std::max(0.1, pac), 2))
             : form.value(QStringLiteral("inverterModel")).toString());

    // 2 Parameters
    endPage();
    c.h1(QStringLiteral("2. General parameters & array"));
    c.h2(QStringLiteral("PV field orientation"));
    c.kv(QStringLiteral("Mounting"), QStringLiteral("Fixed plane"));
    c.kv(QStringLiteral("Transposition model"), QStringLiteral("Hay / isotropic diffuse (OSE)"));
    c.kv(QStringLiteral("Albedo"), QStringLiteral("0.20 (default)"));
    c.kv(QStringLiteral("Horizon points"),
         QString::number(site.value(QStringLiteral("points")).toList().size()));

    c.h2(QStringLiteral("PV array characteristics"));
    c.kv(QStringLiteral("Module"),
         form.value(QStringLiteral("panelModel")).toString().isEmpty()
             ? QStringLiteral("Generic %1 Wp").arg(num(panelWp, 0))
             : form.value(QStringLiteral("panelModel")).toString());
    c.kv(QStringLiteral("Number of modules"), QString::number(nPanels));
    c.kv(QStringLiteral("Nominal (STC)"), QStringLiteral("%1 kWp").arg(num(ppeak, 2)));
    c.kv(QStringLiteral("Module area (approx.)"),
         QStringLiteral("%1 m²").arg(num(nPanels * panelArea, 1)));

    c.h2(QStringLiteral("Inverter"));
    c.kv(QStringLiteral("Model"),
         form.value(QStringLiteral("inverterModel")).toString().isEmpty()
             ? QStringLiteral("Generic")
             : form.value(QStringLiteral("inverterModel")).toString());
    c.kv(QStringLiteral("Pnom AC"), QStringLiteral("%1 kWac").arg(num(pac, 2)));
    c.kv(QStringLiteral("Pnom ratio (DC:AC)"), QStringLiteral("%1").arg(num(ppeak / std::max(0.1, pac), 2)));
    c.kv(QStringLiteral("η Euro (model)"),
         QStringLiteral("%1 %").arg(num(form.value(QStringLiteral("etaEuro"), 0.97).toDouble() * 100, 1)));

    c.h2(QStringLiteral("Array loss parameters"));
    QVariantMap tree = form.value(QStringLiteral("lossTree")).toMap();
    if (tree.isEmpty())
        tree = YearPv::defaultLossTree(form.value(QStringLiteral("losses"), 14).toDouble());
    c.kv(QStringLiteral("Thermal U"),
         QStringLiteral("%1 W/m²K").arg(num(form.value(QStringLiteral("mountU"), 29).toDouble(), 0)));
    c.kv(QStringLiteral("Soiling"), QStringLiteral("%1 %").arg(num(tree.value(QStringLiteral("soiling")).toDouble(), 1)));
    c.kv(QStringLiteral("LID"), QStringLiteral("%1 %").arg(num(tree.value(QStringLiteral("lid")).toDouble(), 1)));
    c.kv(QStringLiteral("Mismatch"),
         QStringLiteral("%1 %").arg(num(tree.value(QStringLiteral("mismatch")).toDouble(), 1)));
    c.kv(QStringLiteral("IAM"), QStringLiteral("%1 %").arg(num(tree.value(QStringLiteral("iam")).toDouble(), 1)));
    c.kv(QStringLiteral("Ohmic DC / AC"),
         QStringLiteral("%1 % / %2 %")
             .arg(num(tree.value(QStringLiteral("ohmicDc")).toDouble(), 1))
             .arg(num(tree.value(QStringLiteral("ohmicAc")).toDouble(), 1)));
    c.kv(QStringLiteral("Availability"),
         QStringLiteral("%1 %").arg(num(tree.value(QStringLiteral("availability")).toDouble(), 1)));
    if (!cable.isEmpty()) {
        c.kv(QStringLiteral("Cable section"),
             QStringLiteral("%1 mm²").arg(cable.value(QStringLiteral("sectionMm2")).toString()));
        c.kv(QStringLiteral("Voltage drop"),
             QStringLiteral("%1 %").arg(num(cable.value(QStringLiteral("voltageDropPct")).toDouble(), 2)));
    }

    // 3 Main results
    endPage();
    c.h1(QStringLiteral("3. Main results"));
    c.h2(QStringLiteral("System production"));
    const double eGrid = kpi.value(QStringLiteral("E_Grid_y"),
                                   grid.value(QStringLiteral("E_annual"),
                                              sizing.value(QStringLiteral("E_annual"), 0)))
                             .toDouble();
    c.kv(QStringLiteral("Produced Energy"),
         eGrid > 0 ? QStringLiteral("%1 kWh/year").arg(num(eGrid, 0)) : QStringLiteral("—"));
    c.kv(QStringLiteral("Specific production"),
         ppeak > 0 && eGrid > 0 ? QStringLiteral("%1 kWh/kWp/year").arg(num(eGrid / ppeak, 0))
                                : QStringLiteral("—"));
    c.kv(QStringLiteral("Performance Ratio PR"),
         kpi.contains(QStringLiteral("PR_pct"))
             ? QStringLiteral("%1 %").arg(num(kpi.value(QStringLiteral("PR_pct")).toDouble(), 1))
             : QStringLiteral("—"));

    c.h2(QStringLiteral("Normalized productions (IEC 61724)"));
    c.kv(QStringLiteral("Yr — Reference yield"),
         QStringLiteral("%1 kWh/kWp/day").arg(num(kpi.value(QStringLiteral("Yr_d")).toDouble(), 2)));
    c.kv(QStringLiteral("Ya — Array yield"),
         QStringLiteral("%1 kWh/kWp/day").arg(num(kpi.value(QStringLiteral("Ya_d")).toDouble(), 2)));
    c.kv(QStringLiteral("Yf — Final system yield"),
         QStringLiteral("%1 kWh/kWp/day").arg(num(kpi.value(QStringLiteral("Yf_d")).toDouble(), 2)));
    c.kv(QStringLiteral("Lc — Collection loss"),
         QStringLiteral("%1 kWh/kWp/day").arg(num(kpi.value(QStringLiteral("Lc_d")).toDouble(), 2)));
    c.kv(QStringLiteral("Ls — System loss"),
         QStringLiteral("%1 kWh/kWp/day").arg(num(kpi.value(QStringLiteral("Ls_d")).toDouble(), 2)));

    if (!balMonths.isEmpty()) {
        drawMiniBars(balMonths, QStringLiteral("E_Grid"), QStringLiteral("E_Grid monthly (kWh)"));
        drawMiniBars(balMonths, QStringLiteral("GlobInc"), QStringLiteral("GlobInc monthly (kWh/m²)"));

        c.h2(QStringLiteral("Balances and main results"));
        c.ensure(24);
        c.setFont(6, true);
        c.p->setPen(kPrimary);
        const int cols[] = {0, 42, 84, 126, 168, 214, 262, 318, 370};
        const char* hdrs[] = {"Month", "GlobHor", "DiffHor", "T_Amb", "GlobInc", "GlobEff",
                              "EArray", "E_Grid", "PR"};
        for (int i = 0; i < 9; ++i)
            c.p->drawText(c.margin + cols[i], c.y, QString::fromUtf8(hdrs[i]));
        c.y += 11;
        for (int i = 0; i < balMonths.size() && i < 12; ++i) {
            const QVariantMap m = balMonths[i].toMap();
            c.ensure(11);
            c.setFont(6);
            c.p->setPen(kText);
            c.p->drawText(c.margin + cols[0], c.y, m.value(QStringLiteral("name")).toString().left(3));
            c.p->drawText(c.margin + cols[1], c.y, num(m.value(QStringLiteral("GlobHor")).toDouble(), 1));
            c.p->drawText(c.margin + cols[2], c.y, num(m.value(QStringLiteral("DiffHor")).toDouble(), 1));
            c.p->drawText(c.margin + cols[3], c.y, num(m.value(QStringLiteral("T_Amb")).toDouble(), 1));
            c.p->drawText(c.margin + cols[4], c.y, num(m.value(QStringLiteral("GlobInc")).toDouble(), 1));
            c.p->drawText(c.margin + cols[5], c.y, num(m.value(QStringLiteral("GlobEff")).toDouble(), 1));
            c.p->drawText(c.margin + cols[6], c.y, num(m.value(QStringLiteral("EArray")).toDouble(), 0));
            c.p->drawText(c.margin + cols[7], c.y, num(m.value(QStringLiteral("E_Grid")).toDouble(), 0));
            c.p->drawText(c.margin + cols[8], c.y, num(m.value(QStringLiteral("PR")).toDouble(), 3));
            c.y += 10;
        }
        c.ensure(12);
        c.setFont(6, true);
        c.p->setPen(kPrimary);
        c.p->drawText(c.margin + cols[0], c.y, QStringLiteral("Year"));
        c.p->drawText(c.margin + cols[1], c.y, num(kpi.value(QStringLiteral("GlobHor_y")).toDouble(), 0));
        c.p->drawText(c.margin + cols[2], c.y, num(kpi.value(QStringLiteral("DiffHor_y")).toDouble(), 0));
        c.p->drawText(c.margin + cols[3], c.y, num(kpi.value(QStringLiteral("T_Amb_avg")).toDouble(), 1));
        c.p->drawText(c.margin + cols[4], c.y, num(kpi.value(QStringLiteral("GlobInc_y")).toDouble(), 0));
        c.p->drawText(c.margin + cols[5], c.y, num(kpi.value(QStringLiteral("GlobEff_y")).toDouble(), 0));
        c.p->drawText(c.margin + cols[6], c.y, num(kpi.value(QStringLiteral("EArray_y")).toDouble(), 0));
        c.p->drawText(c.margin + cols[7], c.y, num(kpi.value(QStringLiteral("E_Grid_y")).toDouble(), 0));
        c.p->drawText(c.margin + cols[8], c.y, num(kpi.value(QStringLiteral("PR")).toDouble(), 3));
        c.y += 14;
        c.para(QStringLiteral("PR = E_Grid / (GlobInc × Pnom). GlobEff = after shade, soiling, IAM."), 7,
               kMuted);
    }

    if (sizing.contains(QStringLiteral("autoconsoRate"))) {
        c.h2(QStringLiteral("Self-consumption (project load)"));
        c.kv(QStringLiteral("Self-consumption rate"),
             QStringLiteral("%1 %").arg(num(sizing.value(QStringLiteral("autoconsoRate")).toDouble(), 1)));
    }

    // 4 Loss diagram
    endPage();
    c.h1(QStringLiteral("4. Loss diagram"));
    c.para(QStringLiteral("Energy balance (PVsyst-style). Percentages are relative to the previous step."),
           8, kMuted);
    if (!lossDiag.isEmpty()) {
        for (const QVariant& v : lossDiag) {
            const QVariantMap n = v.toMap();
            c.ensure(13);
            const double d = n.value(QStringLiteral("deltaPct")).toDouble();
            const bool isLoss = n.value(QStringLiteral("isLoss")).toBool();
            c.setFont(7);
            if (std::abs(d) > 1e-9) {
                c.p->setPen(isLoss && d < 0 ? QColor(0xb0, 0x3a, 0x2e) : kPrimary);
                const QString dp = (d >= 0 ? QStringLiteral("+") : QString()) + num(d, 2)
                                   + QStringLiteral(" %");
                c.p->drawText(c.margin, c.y, dp);
            }
            c.p->setPen(kText);
            c.setFont(7, true);
            c.p->drawText(c.margin + 70, c.y,
                          QStringLiteral("%1 %2")
                              .arg(num(n.value(QStringLiteral("energy")).toDouble(), 1))
                              .arg(n.value(QStringLiteral("unit")).toString()));
            c.setFont(7);
            c.p->setPen(kMuted);
            c.p->drawText(c.margin + 180, c.y, n.value(QStringLiteral("label")).toString());
            c.y += 12;
        }
    } else {
        c.para(QStringLiteral("No loss diagram — load weather and re-export."), 9, kMuted);
    }

    // 5 PVGIS
    endPage();
    c.h1(QStringLiteral("5. PVGIS PVcalc reference (JRC)"));
    if (pvgis.value(QStringLiteral("ok")).toBool()) {
        c.kv(QStringLiteral("Database"),
             QStringLiteral("%1 / %2 (%3–%4)")
                 .arg(pvgis.value(QStringLiteral("radiation_db")).toString())
                 .arg(pvgis.value(QStringLiteral("meteo_db")).toString())
                 .arg(pvgis.value(QStringLiteral("year_min")).toInt())
                 .arg(pvgis.value(QStringLiteral("year_max")).toInt()));
        c.kv(QStringLiteral("Elevation (PVGIS)"),
             QStringLiteral("%1 m").arg(num(pvgis.value(QStringLiteral("elevation")).toDouble(), 0)));
        c.kv(QStringLiteral("E_y (PVGIS)"),
             QStringLiteral("%1 kWh/year").arg(num(pvgis.value(QStringLiteral("E_y")).toDouble(), 0)));
        c.kv(QStringLiteral("H(i)_y"),
             QStringLiteral("%1 kWh/m²").arg(num(pvgis.value(QStringLiteral("H_i_y")).toDouble(), 0)));
        c.kv(QStringLiteral("SD_y (interannual)"),
             QStringLiteral("%1 kWh").arg(num(pvgis.value(QStringLiteral("SD_y")).toDouble(), 0)));
        c.kv(QStringLiteral("l_aoi / l_spec / l_tg"),
             QStringLiteral("%1 % / %2 / %3 %")
                 .arg(num(pvgis.value(QStringLiteral("l_aoi")).toDouble(), 2))
                 .arg(pvgis.value(QStringLiteral("l_spec")).toString())
                 .arg(num(pvgis.value(QStringLiteral("l_tg")).toDouble(), 2)));
        c.kv(QStringLiteral("l_total"),
             QStringLiteral("%1 %").arg(num(pvgis.value(QStringLiteral("l_total")).toDouble(), 2)));
        if (eGrid > 0 && pvgis.value(QStringLiteral("E_y")).toDouble() > 0) {
            const double ey = pvgis.value(QStringLiteral("E_y")).toDouble();
            const double d = (eGrid - ey) / ey * 100.0;
            c.kv(QStringLiteral("OSE vs PVGIS"),
                 QStringLiteral("%1%2 % (%3 kWh OSE)")
                     .arg(d >= 0 ? QStringLiteral("+") : QString())
                     .arg(num(d, 1))
                     .arg(num(eGrid, 0)));
        }
        const QVariantList pm = pvgis.value(QStringLiteral("monthly")).toList();
        if (!pm.isEmpty()) {
            c.h2(QStringLiteral("PVGIS monthly E_m / H(i)_m"));
            c.ensure(16);
            c.setFont(7, true);
            c.p->setPen(kPrimary);
            c.p->drawText(c.margin, c.y, QStringLiteral("Month"));
            c.p->drawText(c.margin + 60, c.y, QStringLiteral("E_d"));
            c.p->drawText(c.margin + 110, c.y, QStringLiteral("E_m"));
            c.p->drawText(c.margin + 170, c.y, QStringLiteral("H(i)_d"));
            c.p->drawText(c.margin + 230, c.y, QStringLiteral("H(i)_m"));
            c.p->drawText(c.margin + 300, c.y, QStringLiteral("SD_m"));
            c.y += 11;
            for (const QVariant& v : pm) {
                const QVariantMap m = v.toMap();
                c.ensure(11);
                c.setFont(7);
                c.p->setPen(kText);
                c.p->drawText(c.margin, c.y, m.value(QStringLiteral("name")).toString());
                c.p->drawText(c.margin + 60, c.y, num(m.value(QStringLiteral("E_d")).toDouble(), 2));
                c.p->drawText(c.margin + 110, c.y, num(m.value(QStringLiteral("E_m")).toDouble(), 1));
                c.p->drawText(c.margin + 170, c.y, num(m.value(QStringLiteral("H_i_d")).toDouble(), 2));
                c.p->drawText(c.margin + 230, c.y, num(m.value(QStringLiteral("H_i_m")).toDouble(), 1));
                c.p->drawText(c.margin + 300, c.y, num(m.value(QStringLiteral("SD_m")).toDouble(), 1));
                c.y += 10;
            }
        }
    } else {
        c.para(QStringLiteral("No PVGIS PVcalc on project — Lieu → Comparer PVcalc, then re-export."), 9,
               kMuted);
    }

    // 6 Economics
    endPage();
    c.h1(QStringLiteral("6. Economic evaluation"));
    const double cost = form.value(QStringLiteral("systemCost"),
                                   sizing.value(QStringLiteral("systemCost"), ppeak * 1200))
                            .toDouble();
    c.kv(QStringLiteral("System cost"), euro(cost));
    if (sizing.contains(QStringLiteral("paybackYears")) || sizing.contains(QStringLiteral("payback")))
        c.kv(QStringLiteral("Payback"),
             QStringLiteral("%1 years")
                 .arg(num(sizing.value(QStringLiteral("paybackYears"), sizing.value(QStringLiteral("payback")))
                              .toDouble(),
                          1)));
    if (sizing.contains(QStringLiteral("npv")) || sizing.contains(QStringLiteral("npv25")))
        c.kv(QStringLiteral("NPV"),
             euro(sizing.value(QStringLiteral("npv25"), sizing.value(QStringLiteral("npv"))).toDouble()));
    if (sizing.contains(QStringLiteral("lcoe")))
        c.kv(QStringLiteral("LCOE"),
             QStringLiteral("%1 €/kWh").arg(num(sizing.value(QStringLiteral("lcoe")).toDouble(), 3)));
    if (sizing.contains(QStringLiteral("incentive")))
        c.kv(QStringLiteral("Incentive (est.)"), euro(sizing.value(QStringLiteral("incentive")).toDouble()));
    c.para(QStringLiteral("Simplified economics — refine with commercial quote."), 8, kMuted);

    if (!off.isEmpty() || install == QLatin1String("offgrid") || install == QLatin1String("hybrid")) {
        c.h1(QStringLiteral("7. Stand-alone / hybrid storage"));
        if (!off.isEmpty()) {
            c.kv(QStringLiteral("Ppeak"),
                 QStringLiteral("%1 kWc").arg(num(off.value(QStringLiteral("Ppeak")).toDouble(), 2)));
            c.kv(QStringLiteral("Battery"),
                 QStringLiteral("%1 kWh").arg(num(off.value(QStringLiteral("battKwh")).toDouble(), 1)));
            if (off.contains(QStringLiteral("coverage")) || off.contains(QStringLiteral("coveragePct")))
                c.kv(QStringLiteral("Coverage"),
                     QStringLiteral("%1 %")
                         .arg(num(off.value(QStringLiteral("coveragePct"), off.value(QStringLiteral("coverage")))
                                      .toDouble(),
                                  1)));
        } else {
            c.para(QStringLiteral("No offgrid result — run Hors réseau."), 9, kMuted);
        }
    }

    c.h1(QStringLiteral("8. Method & limits"));
    c.para(QStringLiteral(
               "• Irradiation: Open-Meteo / PVGIS monthly or hourly TMY.\n"
               "• Balances / PR / loss diagram: YearPv::buildBalancesReport.\n"
               "• Shading: halfHourlyKeep (+ electrical bypass in study).\n"
               "• Inverter: η(P) Euro + clipping when enabled.\n"
               "• Not vs PVsyst Pro: .PAN/.OND, ModuleLayout, Meteonorm, bifacial spectral, CAD SLD.\n"
               "• PVGIS section: JRC API validation reference."),
           8, kMuted);
    c.y += 12;
    c.para(QStringLiteral("End of report — Open Solar Energy %1").arg(QStringLiteral(OSE_APP_VERSION)), 8,
           kMuted);
    drawFooter(c, QStringLiteral("Rapport %1").arg(name), pageNo);
    painter.end();
    return path;
}


QVariantList PdfExport::previewPages(const QString& pdfPath, int maxPages) const
{
    QVariantList out;
    if (pdfPath.isEmpty() || !QFileInfo::exists(pdfPath))
        return out;

#if defined(OSE_HAS_QPDFDOCUMENT)
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
#else
    Q_UNUSED(maxPages);
    // Qt Pdf (lecture) absent sur Android — ouvrir le fichier via intent
#endif
    return out;
}

bool PdfExport::openPdf(const QString& path) const
{
    if (path.isEmpty() || !QFileInfo::exists(path))
        return false;
    return QDesktopServices::openUrl(QUrl::fromLocalFile(path));
}

} // namespace ose
