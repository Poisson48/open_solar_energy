#include "pdf_export.h"

#include "core/year_pv.h"

#include <QDate>
#include <QDateTime>
#include <QDesktopServices>
#include <QDir>
#include <QFileInfo>
#include <QFont>
#include <QHash>
#include <QLocale>
#include <QMetaType>
#include <QPageSize>
#include <QPainter>
#include <QPair>
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
// Style rapport type PVsyst (technique, dense)
const QColor kPvNavy(0x1e, 0x3a, 0x5f);
const QColor kPvBlue(0x2c, 0x5f, 0x8a);
const QColor kPvRow(0xf4, 0xf7, 0xfa);
const QColor kPvLoss(0xa9, 0x32, 0x26);
const QColor kPvBar(0x3d, 0x7e, 0xa6);

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
        // Liberation / DejaVu si dispo (Linux) — sinon Qt choisit un sans correct
        f.setFamilies({QStringLiteral("Liberation Sans"), QStringLiteral("DejaVu Sans"),
                       QStringLiteral("Sans Serif")});
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

QString frLossLabel(const QString& id, const QString& fallback)
{
    static const QHash<QString, QString> map{
        {QStringLiteral("GlobHor"), QStringLiteral("Irradiation globale horizontale")},
        {QStringLiteral("GlobInc"), QStringLiteral("Irradiation globale plan collecteur")},
        {QStringLiteral("Shade"), QStringLiteral("Ombrages proches / lointains")},
        {QStringLiteral("Soiling"), QStringLiteral("Salissure (soiling)")},
        {QStringLiteral("IAM"), QStringLiteral("Facteur IAM")},
        {QStringLiteral("EArrNom"), QStringLiteral("Énergie nominale champ (STC)")},
        {QStringLiteral("IrrLoss"), QStringLiteral("Pertes bas flux")},
        {QStringLiteral("TempLoss"), QStringLiteral("Pertes température")},
        {QStringLiteral("ModQual"), QStringLiteral("Qualité modules")},
        {QStringLiteral("LID"), QStringLiteral("Pertes LID")},
        {QStringLiteral("Mismatch"), QStringLiteral("Mismatch modules / strings")},
        {QStringLiteral("OhmDC"), QStringLiteral("Pertes ohmiques DC")},
        {QStringLiteral("Other"), QStringLiteral("Autres pertes champ")},
        {QStringLiteral("EArrMPP"), QStringLiteral("Énergie virtuelle MPP")},
        {QStringLiteral("Inv"), QStringLiteral("Pertes onduleur (η)")},
        {QStringLiteral("E_Grid"), QStringLiteral("Énergie utile / injectée (E_Grid)")},
    };
    return map.value(id, fallback);
}

void drawPvBand(PdfCtx& c, const QString& title, const QString& right = {})
{
    c.p->fillRect(QRect(0, 0, c.pageW, 44), kPvNavy);
    c.setFont(10, true);
    c.p->setPen(Qt::white);
    c.p->drawText(c.margin, 28, title);
    if (!right.isEmpty()) {
        c.setFont(7);
        const int rw = c.p->fontMetrics().horizontalAdvance(right);
        c.p->drawText(c.pageW - c.margin - rw, 28, right);
    }
    c.y = 58;
}

void drawPvH1(PdfCtx& c, const QString& t)
{
    c.ensure(34);
    c.setFont(13, true);
    c.p->setPen(kPvNavy);
    c.p->drawText(c.margin, c.y + 14, t);
    c.y += 20;
    c.p->setPen(QPen(kPvBlue, 1.8));
    c.p->drawLine(c.margin, c.y, c.margin + c.contentW, c.y);
    c.y += 12;
}

void drawPvH2(PdfCtx& c, const QString& t)
{
    c.ensure(26);
    c.setFont(10, true);
    c.p->setPen(kPvBlue);
    c.p->drawText(c.margin, c.y + 10, t);
    c.y += 18;
}

void drawKvGrid(PdfCtx& c, const QList<QPair<QString, QString>>& rows, int cols = 2)
{
    const int colW = c.contentW / std::max(1, cols);
    for (int i = 0; i < rows.size(); ++i) {
        const int col = i % cols;
        if (col == 0)
            c.ensure(14);
        const int x = c.margin + col * colW;
        c.setFont(7);
        c.p->setPen(kMuted);
        c.p->drawText(x, c.y, rows[i].first);
        c.setFont(8, true);
        c.p->setPen(kText);
        c.p->drawText(x + colW / 2, c.y, rows[i].second);
        if (col == cols - 1 || i == rows.size() - 1)
            c.y += 13;
    }
}

void drawBalancesTable(PdfCtx& c, const QVariantList& months, const QVariantMap& kpi)
{
    if (months.isEmpty())
        return;
    drawPvH2(c, QStringLiteral("Balances and main results"));
    c.ensure(18);
    // Colonnes proportionnelles (contenu dense façon PVsyst)
    const double fracs[] = {0.09, 0.11, 0.11, 0.09, 0.11, 0.11, 0.13, 0.13, 0.12};
    int xs[9];
    int acc = c.margin;
    for (int i = 0; i < 9; ++i) {
        xs[i] = acc;
        acc += int(c.contentW * fracs[i]);
    }
    const char* hdrs[] = {"", "GlobHor", "DiffHor", "TAmb", "GlobInc", "GlobEff",
                          "EArray", "E_Grid", "PR"};
    const int rowH = 12;
    c.p->fillRect(QRect(c.margin, c.y, c.contentW, rowH + 2), kPvNavy);
    c.setFont(6, true);
    c.p->setPen(Qt::white);
    for (int i = 0; i < 9; ++i)
        c.p->drawText(xs[i] + 2, c.y + 10, QString::fromUtf8(hdrs[i]));
    c.y += rowH + 2;

    auto cell = [&](int i, const QString& t, bool bold = false) {
        c.setFont(6, bold);
        c.p->setPen(kText);
        c.p->drawText(xs[i] + 2, c.y + 9, t);
    };

    for (int m = 0; m < months.size() && m < 12; ++m) {
        c.ensure(rowH);
        if (m % 2 == 0)
            c.p->fillRect(QRect(c.margin, c.y, c.contentW, rowH), kPvRow);
        const QVariantMap row = months[m].toMap();
        cell(0, row.value(QStringLiteral("name")).toString().left(3));
        cell(1, num(row.value(QStringLiteral("GlobHor")).toDouble(), 1));
        cell(2, num(row.value(QStringLiteral("DiffHor")).toDouble(), 1));
        cell(3, num(row.value(QStringLiteral("T_Amb")).toDouble(), 1));
        cell(4, num(row.value(QStringLiteral("GlobInc")).toDouble(), 1));
        cell(5, num(row.value(QStringLiteral("GlobEff")).toDouble(), 1));
        cell(6, num(row.value(QStringLiteral("EArray")).toDouble(), 0));
        cell(7, num(row.value(QStringLiteral("E_Grid")).toDouble(), 0));
        cell(8, num(row.value(QStringLiteral("PR")).toDouble(), 3));
        c.y += rowH;
    }
    c.ensure(rowH + 4);
    c.p->fillRect(QRect(c.margin, c.y, c.contentW, rowH), QColor(0xe0, 0xe8, 0xf0));
    cell(0, QStringLiteral("Year"), true);
    cell(1, num(kpi.value(QStringLiteral("GlobHor_y")).toDouble(), 0), true);
    cell(2, num(kpi.value(QStringLiteral("DiffHor_y")).toDouble(), 0), true);
    cell(3, num(kpi.value(QStringLiteral("T_Amb_avg")).toDouble(), 1), true);
    cell(4, num(kpi.value(QStringLiteral("GlobInc_y")).toDouble(), 0), true);
    cell(5, num(kpi.value(QStringLiteral("GlobEff_y")).toDouble(), 0), true);
    cell(6, num(kpi.value(QStringLiteral("EArray_y")).toDouble(), 0), true);
    cell(7, num(kpi.value(QStringLiteral("E_Grid_y")).toDouble(), 0), true);
    cell(8, num(kpi.value(QStringLiteral("PR")).toDouble(), 3), true);
    c.y += rowH + 8;
    c.setFont(6);
    c.p->setPen(kMuted);
    c.p->drawText(c.margin, c.y,
                  QStringLiteral("Unités : Glob* / DiffHor en kWh/m² ; TAmb °C ; EArray / E_Grid en kWh ; PR = E_Grid / (GlobInc × Pnom)"));
    c.y += 12;
}

void drawNormalizedYields(PdfCtx& c, const QVariantMap& kpi)
{
    const double Yr = kpi.value(QStringLiteral("Yr_d")).toDouble();
    const double Ya = kpi.value(QStringLiteral("Ya_d")).toDouble();
    const double Yf = kpi.value(QStringLiteral("Yf_d")).toDouble();
    const double Lc = kpi.value(QStringLiteral("Lc_d")).toDouble();
    const double Ls = kpi.value(QStringLiteral("Ls_d")).toDouble();
    if (Yr <= 0 && Yf <= 0)
        return;
    drawPvH2(c, QStringLiteral("Normalized performance index (IEC 61724)"));
    c.ensure(110);
    const double vmax = std::max({Yr, Ya, Yf, 0.1});
    const int chartH = 70;
    const int baseY = c.y + chartH;
    const int barW = 48;
    const int gap = 36;
    const int startX = c.margin + 40;
    struct Bar {
        QString label;
        double v;
        QColor col;
    };
    const Bar bars[] = {{QStringLiteral("Yr"), Yr, kPvNavy},
                        {QStringLiteral("Ya"), Ya, kPvBlue},
                        {QStringLiteral("Yf"), Yf, kPvBar}};
    for (int i = 0; i < 3; ++i) {
        const int bh = int(std::round(bars[i].v / vmax * chartH));
        const int x = startX + i * (barW + gap);
        c.p->fillRect(QRect(x, baseY - bh, barW, bh), bars[i].col);
        c.setFont(7, true);
        c.p->setPen(kText);
        c.p->drawText(x, baseY + 12, bars[i].label);
        c.setFont(7);
        c.p->setPen(kMuted);
        c.p->drawText(x, baseY + 24, num(bars[i].v, 2));
    }
    c.y = baseY + 36;
    drawKvGrid(c,
               {{QStringLiteral("Yr (référence)"), QStringLiteral("%1 kWh/kWc/j").arg(num(Yr, 2))},
                {QStringLiteral("Ya (array)"), QStringLiteral("%1 kWh/kWc/j").arg(num(Ya, 2))},
                {QStringLiteral("Yf (final)"), QStringLiteral("%1 kWh/kWc/j").arg(num(Yf, 2))},
                {QStringLiteral("Lc = Yr−Ya"), QStringLiteral("%1").arg(num(Lc, 2))},
                {QStringLiteral("Ls = Ya−Yf"), QStringLiteral("%1").arg(num(Ls, 2))},
                {QStringLiteral("PR = Yf/Yr"),
                 QStringLiteral("%1 %").arg(num(kpi.value(QStringLiteral("PR_pct")).toDouble(), 1))}},
               2);
}

void drawLossDiagramVisual(PdfCtx& c, const QVariantList& lossDiag)
{
    if (lossDiag.isEmpty())
        return;
    drawPvH2(c, QStringLiteral("Loss diagram"));
    c.para(QStringLiteral("Chaîne énergétique (pourcentages relatifs à l’étape précédente) — style PVsyst."),
           7, kMuted);

    double eMax = 1;
    for (const QVariant& v : lossDiag) {
        const QVariantMap n = v.toMap();
        if (n.value(QStringLiteral("unit")).toString() == QLatin1String("kWh"))
            eMax = std::max(eMax, n.value(QStringLiteral("energy")).toDouble());
    }

    const int barMaxW = int(c.contentW * 0.42);
    const int labelX = c.margin;
    const int barX = c.margin + int(c.contentW * 0.48);
    const int pctX = c.margin + int(c.contentW * 0.92);

    for (const QVariant& v : lossDiag) {
        const QVariantMap n = v.toMap();
        c.ensure(16);
        const QString id = n.value(QStringLiteral("id")).toString();
        const QString label = frLossLabel(id, n.value(QStringLiteral("label")).toString());
        const double energy = n.value(QStringLiteral("energy")).toDouble();
        const QString unit = n.value(QStringLiteral("unit")).toString();
        const double d = n.value(QStringLiteral("deltaPct")).toDouble();
        const bool isLoss = n.value(QStringLiteral("isLoss")).toBool();
        const bool isKwh = unit == QLatin1String("kWh");

        c.setFont(6);
        c.p->setPen(kText);
        const QString left = QStringLiteral("%1  %2 %3")
                                 .arg(label.left(42))
                                 .arg(num(energy, isKwh ? 0 : 1))
                                 .arg(unit);
        c.p->drawText(QRect(labelX, c.y, barX - labelX - 6, 12),
                      Qt::AlignLeft | Qt::AlignVCenter | Qt::TextSingleLine, left);

        if (isKwh) {
            const int bw = int(std::round(energy / eMax * barMaxW));
            c.p->fillRect(QRect(barX, c.y + 2, std::max(2, bw), 9),
                          isLoss ? QColor(0xc0, 0x70, 0x60) : kPvBar);
        }

        if (std::abs(d) > 1e-6) {
            c.setFont(6, true);
            c.p->setPen(isLoss && d < 0 ? kPvLoss : kPvNavy);
            const QString dp = (d >= 0 ? QStringLiteral("+") : QString()) + num(d, 1)
                               + QStringLiteral("%");
            const int dw = c.p->fontMetrics().horizontalAdvance(dp);
            c.p->drawText(pctX - dw, c.y + 10, dp);
        }
        c.y += 14;
    }
    c.y += 4;
}

void drawMonthlyBarsDual(PdfCtx& c, const QVariantList& balMonths, const QVariantList& monthlyKwh)
{
    if (balMonths.isEmpty())
        return;
    drawPvH2(c, QStringLiteral("Production mensuelle E_Grid"));
    c.ensure(100);
    double vmax = 1;
    for (const QVariant& v : balMonths)
        vmax = std::max(vmax, v.toMap().value(QStringLiteral("E_Grid")).toDouble());
    for (const QVariant& v : monthlyKwh)
        vmax = std::max(vmax, v.toDouble());
    const int chartH = 72;
    const int baseY = c.y + chartH;
    const int slot = std::max(12, c.contentW / 13);
    const int barW = std::max(5, slot / 2 - 2);
    for (int i = 0; i < balMonths.size() && i < 12; ++i) {
        const double e = balMonths[i].toMap().value(QStringLiteral("E_Grid")).toDouble();
        const int bh = int(std::round(e / vmax * chartH));
        const int x = c.margin + i * slot;
        c.p->fillRect(QRect(x, baseY - bh, barW, bh), kPvBar);
        if (i < monthlyKwh.size()) {
            const double load = monthlyKwh[i].toDouble();
            const int lh = int(std::round(load / vmax * chartH));
            c.p->fillRect(QRect(x + barW + 1, baseY - lh, barW, lh), QColor(0x90, 0xa8, 0x90));
        }
        c.setFont(5);
        c.p->setPen(kMuted);
        c.p->drawText(x, baseY + 10,
                      balMonths[i].toMap().value(QStringLiteral("name")).toString().left(3));
    }
    c.y = baseY + 18;
    c.setFont(6);
    c.p->setPen(kPvBar);
    c.p->drawText(c.margin, c.y, QStringLiteral("■ E_Grid"));
    c.p->setPen(QColor(0x90, 0xa8, 0x90));
    c.p->drawText(c.margin + 70, c.y, QStringLiteral("■ Consommation"));
    c.y += 14;
}

int daysInMonth(int m1)
{
    static const int dim[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
    return dim[std::clamp(m1 - 1, 0, 11)];
}

/** Accepte le format client (aplati) ou le JSON brut PVcalc (inputs/outputs). */
QVariantMap normalizePvgisPvcalc(const QVariantMap& raw)
{
    if (raw.value(QStringLiteral("ok")).toBool() && raw.contains(QStringLiteral("E_y")))
        return raw;
    if (raw.contains(QStringLiteral("E_y")) && raw.contains(QStringLiteral("monthly")))
        return raw;

    const QVariantMap inputs = raw.value(QStringLiteral("inputs")).toMap();
    const QVariantMap outputs = raw.value(QStringLiteral("outputs")).toMap();
    if (outputs.isEmpty())
        return raw;

    QVariantMap totals = outputs.value(QStringLiteral("totals")).toMap();
    if (totals.contains(QStringLiteral("fixed")))
        totals = totals.value(QStringLiteral("fixed")).toMap();

    QVariantList monthlySrc;
    const QVariant monthlyVal = outputs.value(QStringLiteral("monthly"));
    if (monthlyVal.typeId() == QMetaType::QVariantMap) {
        const QVariant fixed = monthlyVal.toMap().value(QStringLiteral("fixed"));
        if (fixed.typeId() == QMetaType::QVariantList)
            monthlySrc = fixed.toList();
    } else if (monthlyVal.typeId() == QMetaType::QVariantList) {
        monthlySrc = monthlyVal.toList();
    }

    static const char* months[] = {"Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
                                   "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"};
    QVariantList monthly;
    for (int i = 0; i < monthlySrc.size(); ++i) {
        const QVariantMap row = monthlySrc[i].toMap();
        const int month = row.value(QStringLiteral("month"), i + 1).toInt();
        monthly.append(QVariantMap{
            {QStringLiteral("month"), month},
            {QStringLiteral("name"), QString::fromUtf8(months[std::clamp(month - 1, 0, 11)])},
            {QStringLiteral("E_d"), row.value(QStringLiteral("E_d")).toDouble()},
            {QStringLiteral("E_m"), row.value(QStringLiteral("E_m")).toDouble()},
            {QStringLiteral("H_i_d"),
             row.value(QStringLiteral("H_i_d"), row.value(QStringLiteral("H(i)_d"))).toDouble()},
            {QStringLiteral("H_i_m"),
             row.value(QStringLiteral("H_i_m"), row.value(QStringLiteral("H(i)_m"))).toDouble()},
            {QStringLiteral("SD_m"), row.value(QStringLiteral("SD_m")).toDouble()},
        });
    }

    const QVariantMap loc = inputs.value(QStringLiteral("location")).toMap();
    const QVariantMap meteo = inputs.value(QStringLiteral("meteo_data")).toMap();
    const QVariantMap mount = inputs.value(QStringLiteral("mounting_system")).toMap()
                                  .value(QStringLiteral("fixed")).toMap();
    const QVariantMap mod = inputs.value(QStringLiteral("pv_module")).toMap();
    const double eY = totals.value(QStringLiteral("E_y")).toDouble();

    return {
        {QStringLiteral("ok"), eY > 0},
        {QStringLiteral("E_y"), eY},
        {QStringLiteral("E_d"), totals.value(QStringLiteral("E_d")).toDouble()},
        {QStringLiteral("E_m"), totals.value(QStringLiteral("E_m")).toDouble()},
        {QStringLiteral("H_i_y"),
         totals.value(QStringLiteral("H_i_y"), totals.value(QStringLiteral("H(i)_y"))).toDouble()},
        {QStringLiteral("H_i_d"),
         totals.value(QStringLiteral("H_i_d"), totals.value(QStringLiteral("H(i)_d"))).toDouble()},
        {QStringLiteral("H_i_m"),
         totals.value(QStringLiteral("H_i_m"), totals.value(QStringLiteral("H(i)_m"))).toDouble()},
        {QStringLiteral("SD_y"), totals.value(QStringLiteral("SD_y")).toDouble()},
        {QStringLiteral("SD_m"), totals.value(QStringLiteral("SD_m")).toDouble()},
        {QStringLiteral("l_aoi"), totals.value(QStringLiteral("l_aoi")).toDouble()},
        {QStringLiteral("l_spec"), totals.value(QStringLiteral("l_spec"))},
        {QStringLiteral("l_tg"), totals.value(QStringLiteral("l_tg")).toDouble()},
        {QStringLiteral("l_total"), totals.value(QStringLiteral("l_total")).toDouble()},
        {QStringLiteral("peakpower"), mod.value(QStringLiteral("peak_power")).toDouble()},
        {QStringLiteral("tilt"), mount.value(QStringLiteral("slope")).toMap()
                                     .value(QStringLiteral("value")).toDouble()},
        {QStringLiteral("azimuth"), mount.value(QStringLiteral("azimuth")).toMap()
                                        .value(QStringLiteral("value")).toDouble()},
        {QStringLiteral("loss"), mod.value(QStringLiteral("system_loss")).toDouble()},
        {QStringLiteral("monthly"), monthly},
        {QStringLiteral("elevation"), loc.value(QStringLiteral("elevation")).toDouble()},
        {QStringLiteral("radiation_db"), meteo.value(QStringLiteral("radiation_db")).toString()},
        {QStringLiteral("meteo_db"), meteo.value(QStringLiteral("meteo_db")).toString()},
        {QStringLiteral("year_min"), meteo.value(QStringLiteral("year_min")).toInt()},
        {QStringLiteral("year_max"), meteo.value(QStringLiteral("year_max")).toInt()},
        {QStringLiteral("use_horizon"), meteo.value(QStringLiteral("use_horizon")).toBool()},
        {QStringLiteral("horizon_db"), meteo.value(QStringLiteral("horizon_db")).toString()},
        {QStringLiteral("mounting"),
         mount.value(QStringLiteral("type")).toString().isEmpty()
             ? QStringLiteral("free-standing")
             : mount.value(QStringLiteral("type")).toString()},
        {QStringLiteral("tech"), mod.value(QStringLiteral("technology")).toString()},
        {QStringLiteral("source"), QStringLiteral("pvgis-pvcalc")},
    };
}

void drawPvgisMonthlyTable(PdfCtx& c, const QVariantList& months, const QVariantMap& totals)
{
    if (months.isEmpty())
        return;
    drawPvH2(c, QStringLiteral("Monthly production (PVGIS PVcalc)"));
    c.ensure(20);
    const double fracs[] = {0.10, 0.14, 0.16, 0.16, 0.18, 0.14, 0.12};
    int xs[7];
    int acc = c.margin;
    for (int i = 0; i < 7; ++i) {
        xs[i] = acc;
        acc += int(c.contentW * fracs[i]);
    }
    const char* hdrs[] = {"Month", "E_d", "E_m", "H(i)_d", "H(i)_m", "SD_m", ""};
    const int rowH = 12;
    c.p->fillRect(QRect(c.margin, c.y, c.contentW, rowH + 2), kPvNavy);
    c.setFont(6, true);
    c.p->setPen(Qt::white);
    for (int i = 0; i < 6; ++i)
        c.p->drawText(xs[i] + 2, c.y + 10, QString::fromUtf8(hdrs[i]));
    c.y += rowH + 2;

    auto cell = [&](int i, const QString& t, bool bold = false) {
        c.setFont(6, bold);
        c.p->setPen(kText);
        c.p->drawText(xs[i] + 2, c.y + 9, t);
    };

    for (int i = 0; i < months.size() && i < 12; ++i) {
        c.ensure(rowH);
        if (i % 2 == 0)
            c.p->fillRect(QRect(c.margin, c.y, c.contentW, rowH), kPvRow);
        const QVariantMap m = months[i].toMap();
        cell(0, m.value(QStringLiteral("name")).toString().left(3));
        cell(1, num(m.value(QStringLiteral("E_d")).toDouble(), 2));
        cell(2, num(m.value(QStringLiteral("E_m")).toDouble(), 1));
        cell(3, num(m.value(QStringLiteral("H_i_d")).toDouble(), 2));
        cell(4, num(m.value(QStringLiteral("H_i_m")).toDouble(), 1));
        cell(5, num(m.value(QStringLiteral("SD_m")).toDouble(), 1));
        c.y += rowH;
    }
    c.ensure(rowH + 4);
    c.p->fillRect(QRect(c.margin, c.y, c.contentW, rowH), QColor(0xe0, 0xe8, 0xf0));
    cell(0, QStringLiteral("Year"), true);
    cell(1, num(totals.value(QStringLiteral("E_d")).toDouble(), 2), true);
    cell(2, num(totals.value(QStringLiteral("E_m"),
                             totals.value(QStringLiteral("E_y")).toDouble() / 12.0)
                    .toDouble(),
                1),
         true);
    cell(3, num(totals.value(QStringLiteral("H_i_d")).toDouble(), 2), true);
    cell(4, num(totals.value(QStringLiteral("H_i_m"),
                             totals.value(QStringLiteral("H_i_y")).toDouble() / 12.0)
                    .toDouble(),
                1),
         true);
    cell(5, num(totals.value(QStringLiteral("SD_y")).toDouble(), 1), true);
    c.y += rowH + 6;
    c.setFont(6);
    c.p->setPen(kMuted);
    c.p->drawText(c.margin, c.y,
                  QStringLiteral("E_d kWh/j · E_m kWh/mois · H(i)_* kWh/m² · SD_m / Year=SD_y (variabilité interannuelle)"));
    c.y += 12;
}

void drawSimpleMonthlyBars(PdfCtx& c, const QVariantList& months, const QString& key,
                           const QString& title, const QColor& color)
{
    if (months.isEmpty())
        return;
    drawPvH2(c, title);
    c.ensure(95);
    double vmax = 1;
    for (const QVariant& v : months)
        vmax = std::max(vmax, v.toMap().value(key).toDouble());
    const int chartH = 68;
    const int baseY = c.y + chartH;
    const int slot = std::max(14, c.contentW / 13);
    const int barW = std::max(8, slot - 4);
    for (int i = 0; i < months.size() && i < 12; ++i) {
        const double val = months[i].toMap().value(key).toDouble();
        const int bh = int(std::round(val / vmax * chartH));
        const int x = c.margin + i * slot;
        c.p->fillRect(QRect(x, baseY - bh, barW, bh), color);
        c.setFont(5);
        c.p->setPen(kMuted);
        c.p->drawText(x, baseY + 10,
                      months[i].toMap().value(QStringLiteral("name")).toString().left(3));
    }
    c.y = baseY + 16;
}

void drawOsePvgisStyleTable(PdfCtx& c, const QVariantList& balMonths)
{
    if (balMonths.isEmpty())
        return;
    drawPvH2(c, QStringLiteral("OSE productible (format PVGIS)"));
    c.ensure(20);
    const double fracs[] = {0.12, 0.18, 0.18, 0.18, 0.18, 0.16};
    int xs[6];
    int acc = c.margin;
    for (int i = 0; i < 6; ++i) {
        xs[i] = acc;
        acc += int(c.contentW * fracs[i]);
    }
    const char* hdrs[] = {"Month", "E_d", "E_m", "H(i)_d", "H(i)_m", "PR"};
    const int rowH = 12;
    c.p->fillRect(QRect(c.margin, c.y, c.contentW, rowH + 2), kPvNavy);
    c.setFont(6, true);
    c.p->setPen(Qt::white);
    for (int i = 0; i < 6; ++i)
        c.p->drawText(xs[i] + 2, c.y + 10, QString::fromUtf8(hdrs[i]));
    c.y += rowH + 2;

    double sumE = 0, sumHi = 0;
    for (int i = 0; i < balMonths.size() && i < 12; ++i) {
        c.ensure(rowH);
        if (i % 2 == 0)
            c.p->fillRect(QRect(c.margin, c.y, c.contentW, rowH), kPvRow);
        const QVariantMap m = balMonths[i].toMap();
        const int month = m.value(QStringLiteral("month"), i + 1).toInt();
        const int dim = daysInMonth(month);
        const double Em = m.value(QStringLiteral("E_Grid")).toDouble();
        const double Him = m.value(QStringLiteral("GlobInc")).toDouble();
        sumE += Em;
        sumHi += Him;
        c.setFont(6);
        c.p->setPen(kText);
        c.p->drawText(xs[0] + 2, c.y + 9, m.value(QStringLiteral("name")).toString().left(3));
        c.p->drawText(xs[1] + 2, c.y + 9, num(Em / dim, 2));
        c.p->drawText(xs[2] + 2, c.y + 9, num(Em, 1));
        c.p->drawText(xs[3] + 2, c.y + 9, num(Him / dim, 2));
        c.p->drawText(xs[4] + 2, c.y + 9, num(Him, 1));
        c.p->drawText(xs[5] + 2, c.y + 9, num(m.value(QStringLiteral("PR")).toDouble(), 3));
        c.y += rowH;
    }
    c.ensure(rowH + 4);
    c.p->fillRect(QRect(c.margin, c.y, c.contentW, rowH), QColor(0xe0, 0xe8, 0xf0));
    c.setFont(6, true);
    c.p->setPen(kText);
    c.p->drawText(xs[0] + 2, c.y + 9, QStringLiteral("Year"));
    c.p->drawText(xs[1] + 2, c.y + 9, num(sumE / 365.0, 2));
    c.p->drawText(xs[2] + 2, c.y + 9, num(sumE, 0));
    c.p->drawText(xs[3] + 2, c.y + 9, num(sumHi / 365.0, 2));
    c.p->drawText(xs[4] + 2, c.y + 9, num(sumHi, 0));
    c.y += rowH + 10;
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
    double eAnnual = project.value(QStringLiteral("pvsystBalances")).toMap()
                         .value(QStringLiteral("kpi")).toMap()
                         .value(QStringLiteral("E_Grid_y")).toDouble();
    if (eAnnual <= 0)
        eAnnual = sizing.value(QStringLiteral("E_annual")).toDouble();
    if (eAnnual <= 0)
        eAnnual = grid.value(QStringLiteral("E_annual")).toDouble();
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

QString euro0(double v)
{
    return fr().toString(v, 'f', 0) + QStringLiteral(" €");
}

QString paybackLabel(const QVariant& pb)
{
    if (!pb.isValid() || pb.isNull())
        return QStringLiteral("—");
    const double y = pb.toDouble();
    if (y <= 0)
        return QStringLiteral("—");
    return QStringLiteral("%1 ans").arg(fr().toString(y, 'f', y >= 10 ? 0 : 1));
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
    const QVariantMap pvgis = normalizePvgisPvcalc(
        project.value(QStringLiteral("pvgisPvcalc")).toMap());
    const QVariantMap bill = project.value(QStringLiteral("bill")).toMap();
    const QString name = project.value(QStringLiteral("name")).toString().isEmpty()
                             ? QStringLiteral("Projet PV")
                             : project.value(QStringLiteral("name")).toString();
    const QString install = project.value(QStringLiteral("installType")).toString();
    const QString variant = form.value(QStringLiteral("variantName"),
                                       QStringLiteral("Simulation principale"))
                                .toString();

    const double ppeak = form.value(QStringLiteral("Ppeak"),
                                    sizing.value(QStringLiteral("Ppeak"),
                                                 off.value(QStringLiteral("Ppeak"), 3)))
                             .toDouble();
    const double panelWp = form.value(QStringLiteral("panelWp"), 400).toDouble();
    const int nPanels = panelWp > 0 ? int(std::lround(ppeak * 1000.0 / panelWp)) : 0;
    const double panelArea = form.value(QStringLiteral("panelArea"), 2.0).toDouble();
    const double tilt = form.value(QStringLiteral("tilt"), 30).toDouble();
    const double azimuth = form.value(QStringLiteral("azimuth"), 0).toDouble();

    const double systemCost = sizing.value(QStringLiteral("systemCost"),
                                           form.value(QStringLiteral("systemCost"), ppeak * 1200))
                                  .toDouble();
    const double incentive = sizing.value(QStringLiteral("incentive")).toDouble();
    const double netCost = std::max(0.0, systemCost - incentive);
    const double savings = sizing.value(QStringLiteral("savings")).toDouble();
    const QVariant payback = sizing.value(QStringLiteral("paybackYears"),
                                          sizing.value(QStringLiteral("payback")));
    const double npv = sizing.value(QStringLiteral("npv25"), sizing.value(QStringLiteral("npv"))).toDouble();
    const double lcoe = sizing.value(QStringLiteral("LCOE"), sizing.value(QStringLiteral("lcoe"))).toDouble();
    double eAnnual = project.value(QStringLiteral("pvsystBalances")).toMap()
                         .value(QStringLiteral("kpi")).toMap()
                         .value(QStringLiteral("E_Grid_y")).toDouble();
    if (eAnnual <= 0)
        eAnnual = sizing.value(QStringLiteral("E_annual")).toDouble();
    if (eAnnual <= 0)
        eAnnual = grid.value(QStringLiteral("E_annual")).toDouble();
    const double autoconsoRate = sizing.value(QStringLiteral("autoconsoRate")).toDouble();
    const double coverage = sizing.value(QStringLiteral("coverage")).toDouble();
    const double autoconsoKwh = sizing.value(QStringLiteral("autoconso")).toDouble();
    const double injectedKwh = sizing.value(QStringLiteral("injected")).toDouble();
    const double annualBill = sizingRoot.value(QStringLiteral("annualBill")).toDouble();
    const bool hasFinance = !sizing.isEmpty() && (systemCost > 0 || savings > 0 || payback.isValid());

    QVariantMap balances = project.value(QStringLiteral("pvsystBalances")).toMap();
    if (!balances.value(QStringLiteral("ok")).toBool() && !weather.isEmpty()) {
        QVariantMap bp{
            {QStringLiteral("lat"), loc.value(QStringLiteral("lat"), 43.6)},
            {QStringLiteral("tilt"), tilt},
            {QStringLiteral("azimuth"), azimuth},
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
            {QStringLiteral("hourlyWeatherData"), project.value(QStringLiteral("hourlyWeatherData"))},
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
    const QVariantMap lossTree = balances.value(QStringLiteral("lossTree")).toMap().isEmpty()
                                     ? form.value(QStringLiteral("lossTree")).toMap()
                                     : balances.value(QStringLiteral("lossTree")).toMap();
    const double eGrid = kpi.value(QStringLiteral("E_Grid_y"), eAnnual).toDouble();
    const double specific = kpi.value(QStringLiteral("specificYield"),
                                      ppeak > 0 ? eGrid / ppeak : 0)
                                .toDouble();
    const double prPct = kpi.value(QStringLiteral("PR_pct")).toDouble();

    const QVariantList monthlyKwh = project.value(QStringLiteral("monthlyKwh")).toList().isEmpty()
                                        ? bill.value(QStringLiteral("monthlyKwh")).toList()
                                        : project.value(QStringLiteral("monthlyKwh")).toList();

    const QString locName = loc.value(QStringLiteral("name")).toString().isEmpty()
                                ? (loc.value(QStringLiteral("label")).toString().isEmpty()
                                       ? QStringLiteral("—")
                                       : loc.value(QStringLiteral("label")).toString())
                                : loc.value(QStringLiteral("name")).toString();
    const double lat = loc.value(QStringLiteral("lat")).toDouble();
    const double lon = loc.value(QStringLiteral("lon")).toDouble();
    const double pac = form.value(QStringLiteral("pacNom"), ppeak * 0.9).toDouble();
    const QString meteoSrc = weatherMeta.value(QStringLiteral("source")).toString().isEmpty()
                                 ? QStringLiteral("Open-Meteo / fichier projet")
                                 : weatherMeta.value(QStringLiteral("source")).toString();

    const QString path = docsDir() + QStringLiteral("/rapport_")
                         + name.toLower()
                               .replace(QRegularExpression(QStringLiteral("[^a-z0-9]+")),
                                        QStringLiteral("_"))
                               .left(40)
                         + QStringLiteral("_")
                         + QDate::currentDate().toString(QStringLiteral("yyyyMMdd"))
                         + QStringLiteral(".pdf");

    QPdfWriter writer(path);
    writer.setTitle(QStringLiteral("Simulation report — %1").arg(name));
    writer.setCreator(QStringLiteral("Open Solar Energy %1").arg(QStringLiteral(OSE_APP_VERSION)));
    writer.setPageSize(QPageSize(QPageSize::A4));
    writer.setResolution(120);

    QPainter painter(&writer);
    if (!painter.isActive())
        return {};

    PdfCtx c;
    c.begin(&writer, &painter);
    int pageNo = 1;
    auto endPage = [&]() {
        drawFooter(c, QStringLiteral("%1 — %2").arg(name, variant), pageNo++);
        c.newPage();
    };

    // ═══════════════ 1. COVER (PVsyst-like) ═══════════════
    drawPvBand(c, QStringLiteral("Grid-connected system simulation report"),
               QStringLiteral("Open Solar Energy %1").arg(QStringLiteral(OSE_APP_VERSION)));
    c.setFont(20, true);
    c.p->setPen(kPvNavy);
    c.p->drawText(c.margin, c.y + 8, name);
    c.y += 28;
    c.setFont(11);
    c.p->setPen(kText);
    c.para(QStringLiteral("Variant : %1").arg(variant), 11);
    c.para(QStringLiteral("System : %1").arg(installLabel(install)), 11);
    c.para(QStringLiteral("Pnom : %1 kWp  ·  %2 modules × %3 Wp")
               .arg(num(ppeak, 2))
               .arg(nPanels)
               .arg(num(panelWp, 0)),
           11);
    c.para(QStringLiteral("Site : %1").arg(locName), 11);
    if (std::abs(lat) + std::abs(lon) > 0.01)
        c.para(QStringLiteral("Coordinates : %1 °N, %2 °E")
                   .arg(lat, 0, 'f', 5)
                   .arg(lon, 0, 'f', 5),
               10, kMuted);
    c.para(QStringLiteral("Date : %1").arg(fr().toString(QDate::currentDate(), QLocale::LongFormat)), 10);

    c.y += 10;
    c.p->fillRect(QRect(c.margin, c.y, c.contentW, 78), kPvRow);
    c.p->setPen(QPen(kPvBlue, 1));
    c.p->drawRect(QRect(c.margin, c.y, c.contentW, 78));
    const int boxY = c.y;
    c.setFont(8, true);
    c.p->setPen(kPvNavy);
    c.p->drawText(c.margin + 12, boxY + 18, QStringLiteral("Main results"));
    c.setFont(9);
    c.p->setPen(kText);
    c.p->drawText(c.margin + 12, boxY + 36,
                  QStringLiteral("E_Grid  %1 kWh/an").arg(num(eGrid > 0 ? eGrid : eAnnual, 0)));
    c.p->drawText(c.margin + 12, boxY + 52,
                  QStringLiteral("Specific  %1 kWh/kWp/an").arg(num(specific, 0)));
    c.p->drawText(c.margin + 12, boxY + 68,
                  QStringLiteral("PR  %1 %").arg(prPct > 0 ? num(prPct, 1) : QStringLiteral("—")));
    c.p->drawText(c.margin + c.contentW / 2, boxY + 36,
                  QStringLiteral("GlobInc  %1 kWh/m²")
                      .arg(num(kpi.value(QStringLiteral("GlobInc_y")).toDouble(), 0)));
    c.p->drawText(c.margin + c.contentW / 2, boxY + 52,
                  QStringLiteral("Client  %1")
                      .arg(clientName(project).isEmpty() ? QStringLiteral("—")
                                                       : clientName(project)));
    if (hasFinance)
        c.p->drawText(c.margin + c.contentW / 2, boxY + 68,
                      QStringLiteral("Payback  %1").arg(paybackLabel(payback)));
    c.y = boxY + 92;
    c.para(QStringLiteral("Document technique d’aide à la décision (structure type PVsyst). "
                          "Le devis commercial fait foi pour les prix."),
           8, kMuted);
    endPage();

    // ═══════════════ 2. SUMMARY + TOC ═══════════════
    drawPvBand(c, QStringLiteral("Project summary"),
               QStringLiteral("Page %1").arg(pageNo));
    drawPvH1(c, QStringLiteral("1. Project summary"));
    drawKvGrid(c,
               {{QStringLiteral("Geographic site"), locName},
                {QStringLiteral("Latitude / Longitude"),
                 QStringLiteral("%1 / %2").arg(lat, 0, 'f', 4).arg(lon, 0, 'f', 4)},
                {QStringLiteral("Meteo data"), meteoSrc},
                {QStringLiteral("Simulation"),
                 form.value(QStringLiteral("energyMode")).toString() == QLatin1String("study")
                     ? QStringLiteral("Study (horaire)")
                     : QStringLiteral("Fast / forfaitaire")},
                {QStringLiteral("Orientation"),
                 QStringLiteral("Tilt %1° / Azimuth %2° (0=Sud)")
                     .arg(num(tilt, 1))
                     .arg(num(azimuth, 1))},
                {QStringLiteral("Near shadings"),
                 site.value(QStringLiteral("annualLossPct")).toDouble() > 0
                     ? QStringLiteral("Yes — ~%1 % beam loss")
                           .arg(num(site.value(QStringLiteral("annualLossPct")).toDouble(), 1))
                     : QStringLiteral("None / not defined")}},
               2);

    c.y += 6;
    drawPvH2(c, QStringLiteral("Results summary"));
    drawKvGrid(c,
               {{QStringLiteral("System production E_Grid"),
                 QStringLiteral("%1 kWh/y").arg(num(eGrid > 0 ? eGrid : eAnnual, 0))},
                {QStringLiteral("Specific production"),
                 QStringLiteral("%1 kWh/kWp/y").arg(num(specific, 0))},
                {QStringLiteral("Performance Ratio PR"),
                 QStringLiteral("%1 %").arg(prPct > 0 ? num(prPct, 1) : QStringLiteral("—"))},
                {QStringLiteral("Array nom. energy"),
                 QStringLiteral("%1 kWh").arg(num(kpi.value(QStringLiteral("EArray_y")).toDouble(), 0))},
                {QStringLiteral("Self-consumption"),
                 autoconsoRate > 0 ? QStringLiteral("%1 % (%2 kWh)")
                                        .arg(num(autoconsoRate, 1))
                                        .arg(num(autoconsoKwh, 0))
                                  : QStringLiteral("—")},
                {QStringLiteral("Load coverage"),
                 coverage > 0 ? QStringLiteral("%1 %").arg(num(coverage, 1)) : QStringLiteral("—")}},
               2);

    c.y += 10;
    drawPvH2(c, QStringLiteral("Table of contents"));
    const QStringList toc{
        QStringLiteral("1. Project summary"),
        QStringLiteral("2. General parameters"),
        QStringLiteral("3. Main results — balances & normalized yields"),
        QStringLiteral("4. Loss diagram"),
        QStringLiteral("5. Economic evaluation"),
        QStringLiteral("6. Near shadings / site"),
        QStringLiteral("7. PVGIS PVcalc report (JRC)"),
        QStringLiteral("8. Methodology"),
    };
    for (const QString& line : toc) {
        c.ensure(14);
        c.setFont(9);
        c.p->setPen(kText);
        c.p->drawText(c.margin + 8, c.y, line);
        c.y += 14;
    }
    endPage();

    // ═══════════════ 3. GENERAL PARAMETERS ═══════════════
    drawPvBand(c, QStringLiteral("General parameters"),
               QStringLiteral("Page %1").arg(pageNo));
    drawPvH1(c, QStringLiteral("2. General parameters"));

    drawPvH2(c, QStringLiteral("Orientation & meteo"));
    drawKvGrid(c,
               {{QStringLiteral("Plane tilt"), QStringLiteral("%1 °").arg(num(tilt, 1))},
                {QStringLiteral("Azimuth"), QStringLiteral("%1 °").arg(num(azimuth, 1))},
                {QStringLiteral("Albedo (défaut)"), QStringLiteral("0,20")},
                {QStringLiteral("Transposition"), QStringLiteral("Modèle mensuel OSE")},
                {QStringLiteral("Meteo source"), meteoSrc},
                {QStringLiteral("GlobHor annuel"),
                 QStringLiteral("%1 kWh/m²")
                     .arg(num(kpi.value(QStringLiteral("GlobHor_y")).toDouble(), 0))}},
               2);

    drawPvH2(c, QStringLiteral("PV array characteristics"));
    drawKvGrid(c,
               {{QStringLiteral("Module"),
                 form.value(QStringLiteral("panelModel")).toString().isEmpty()
                     ? QStringLiteral("Generic %1 Wp").arg(num(panelWp, 0))
                     : form.value(QStringLiteral("panelModel")).toString()},
                {QStringLiteral("Number of modules"), QString::number(nPanels)},
                {QStringLiteral("Unit power"), QStringLiteral("%1 Wp").arg(num(panelWp, 0))},
                {QStringLiteral("Nominal power (STC)"), QStringLiteral("%1 kWp").arg(num(ppeak, 2))},
                {QStringLiteral("Total module area"),
                 QStringLiteral("%1 m²").arg(num(nPanels * panelArea, 1))},
                {QStringLiteral("Tech."),
                 form.value(QStringLiteral("tech"), QStringLiteral("crystSi")).toString()}},
               2);

    drawPvH2(c, QStringLiteral("Inverter"));
    drawKvGrid(c,
               {{QStringLiteral("Model"),
                 form.value(QStringLiteral("inverterModel")).toString().isEmpty()
                     ? QStringLiteral("Generic")
                     : form.value(QStringLiteral("inverterModel")).toString()},
                {QStringLiteral("Pnom AC"), QStringLiteral("%1 kWac").arg(num(pac, 2))},
                {QStringLiteral("Pnom ratio (DC/AC)"),
                 QStringLiteral("%1").arg(num(ppeak / std::max(0.1, pac), 2))},
                {QStringLiteral("Euro efficiency"),
                 QStringLiteral("%1 %")
                     .arg(num(form.value(QStringLiteral("etaEuro"), 0.97).toDouble() * 100, 1))}},
               2);

    if (!lossTree.isEmpty()) {
        drawPvH2(c, QStringLiteral("Array / system loss parameters"));
        QList<QPair<QString, QString>> lossRows;
        const QList<QPair<QString, QString>> keys{
            {QStringLiteral("soiling"), QStringLiteral("Soiling")},
            {QStringLiteral("iam"), QStringLiteral("IAM")},
            {QStringLiteral("lid"), QStringLiteral("LID")},
            {QStringLiteral("mismatch"), QStringLiteral("Mismatch")},
            {QStringLiteral("ohmicDc"), QStringLiteral("Ohmic DC")},
            {QStringLiteral("ohmicAc"), QStringLiteral("Ohmic AC")},
            {QStringLiteral("availability"), QStringLiteral("Unavailability")},
            {QStringLiteral("quality"), QStringLiteral("Module quality")},
        };
        for (const auto& k : keys) {
            if (lossTree.contains(k.first))
                lossRows.append({k.second,
                                 QStringLiteral("%1 %").arg(num(lossTree.value(k.first).toDouble(), 2))});
        }
        if (!lossRows.isEmpty())
            drawKvGrid(c, lossRows, 2);
    }

    if (!cable.isEmpty()) {
        drawPvH2(c, QStringLiteral("AC / DC wiring (project)"));
        drawKvGrid(c,
                   {{QStringLiteral("Section"),
                     QStringLiteral("%1 mm²").arg(cable.value(QStringLiteral("sectionMm2")).toString())},
                    {QStringLiteral("Voltage drop"),
                     QStringLiteral("%1 %")
                         .arg(num(cable.value(QStringLiteral("voltageDropPct")).toDouble(), 2))}},
                   2);
    }

    if (install == QLatin1String("hybrid") || install == QLatin1String("offgrid") || !off.isEmpty()) {
        drawPvH2(c, QStringLiteral("Storage"));
        const double batt = off.value(QStringLiteral("battKwh"), form.value(QStringLiteral("battKwh")))
                                .toDouble();
        drawKvGrid(c, {{QStringLiteral("Battery capacity"), QStringLiteral("%1 kWh").arg(num(batt, 1))}},
                   2);
    }
    endPage();

    // ═══════════════ 4. MAIN RESULTS ═══════════════
    drawPvBand(c, QStringLiteral("Main results"),
               QStringLiteral("Page %1").arg(pageNo));
    drawPvH1(c, QStringLiteral("3. Main results"));
    drawKvGrid(c,
               {{QStringLiteral("Produced Energy E_Grid"),
                 QStringLiteral("%1 kWh/year").arg(num(eGrid > 0 ? eGrid : eAnnual, 0))},
                {QStringLiteral("Specific production"),
                 QStringLiteral("%1 kWh/kWp/year").arg(num(specific, 0))},
                {QStringLiteral("Performance Ratio PR"),
                 QStringLiteral("%1 %").arg(prPct > 0 ? num(prPct, 1) : QStringLiteral("—"))},
                {QStringLiteral("Normalized Yf"),
                 QStringLiteral("%1 kWh/kWp/day")
                     .arg(num(kpi.value(QStringLiteral("Yf_d")).toDouble(), 2))}},
               2);

    drawNormalizedYields(c, kpi);
    drawMonthlyBarsDual(c, balMonths, monthlyKwh);
    drawBalancesTable(c, balMonths, kpi);
    endPage();

    // ═══════════════ 5. LOSS DIAGRAM ═══════════════
    drawPvBand(c, QStringLiteral("Loss diagram"),
               QStringLiteral("Page %1").arg(pageNo));
    drawPvH1(c, QStringLiteral("4. Loss diagram"));
    if (lossDiag.isEmpty()) {
        c.para(QStringLiteral("Diagramme indisponible — lancez Dimensionnement → Calculer "
                              "(nécessite météo)."),
               9, kMuted);
    } else {
        drawLossDiagramVisual(c, lossDiag);
    }
    endPage();

    // ═══════════════ 6. ECONOMIC ═══════════════
    drawPvBand(c, QStringLiteral("Economic evaluation"),
               QStringLiteral("Page %1").arg(pageNo));
    drawPvH1(c, QStringLiteral("5. Economic evaluation"));
    if (!hasFinance) {
        c.para(QStringLiteral("Pas de résultat financier — Dimensionnement → Calculer."), 10, kMuted);
    } else {
        drawPvH2(c, QStringLiteral("Investment"));
        drawKvGrid(c,
                   {{QStringLiteral("System cost"), euro0(systemCost)},
                    {QStringLiteral("Incentive (FR, indic.)"), euro0(incentive)},
                    {QStringLiteral("Net investment"), euro0(netCost)},
                    {QStringLiteral("Cost per kWp"),
                     euro0(ppeak > 0 ? systemCost / ppeak : 0) + QStringLiteral("/kWp")}},
                   2);
        drawPvH2(c, QStringLiteral("Annual gains"));
        drawKvGrid(c,
                   {{QStringLiteral("Savings (bill + export)"), euro0(savings) + QStringLiteral("/y")},
                    {QStringLiteral("Self-consumed energy"),
                     QStringLiteral("%1 kWh/y").arg(num(autoconsoKwh, 0))},
                    {QStringLiteral("Exported energy"),
                     QStringLiteral("%1 kWh/y").arg(num(injectedKwh, 0))},
                    {QStringLiteral("Current bill (ref.)"),
                     annualBill > 0 ? euro0(annualBill) + QStringLiteral("/y")
                                    : QStringLiteral("—")}},
                   2);
        drawPvH2(c, QStringLiteral("Profitability"));
        drawKvGrid(c,
                   {{QStringLiteral("Payback"), paybackLabel(payback)},
                    {QStringLiteral("NPV 25 years"),
                     (npv >= 0 ? QStringLiteral("+") : QString()) + euro0(npv)},
                    {QStringLiteral("LCOE"),
                     lcoe > 0 ? QStringLiteral("%1 €/kWh").arg(num(lcoe, 3)) : QStringLiteral("—")},
                    {QStringLiteral("Self-consumption rate"),
                     QStringLiteral("%1 %").arg(num(autoconsoRate, 1))}},
                   2);
        c.para(QStringLiteral("Hypothèses : actualisation 3–4 %, dégradation 0,5 %/an, O&M 0,5 %/an, "
                              "remplacement onduleur ~année 15. Injection et tarif selon formulaire."),
               7, kMuted);
    }
    endPage();

    // ═══════════════ 7. SHADINGS ═══════════════
    drawPvBand(c, QStringLiteral("Near shadings / site"),
               QStringLiteral("Page %1").arg(pageNo));
    drawPvH1(c, QStringLiteral("6. Near shadings & site"));
    const double annShade = site.value(QStringLiteral("annualLossPct")).toDouble();
    const QVariantList monthlyLoss = site.value(QStringLiteral("monthlyLoss")).toList();
    if (annShade > 0 || !monthlyLoss.isEmpty()) {
        drawKvGrid(c,
                   {{QStringLiteral("Annual beam loss"), QStringLiteral("%1 %").arg(num(annShade, 1))},
                    {QStringLiteral("Electrical shade"),
                     form.value(QStringLiteral("energyMode")).toString() == QLatin1String("study")
                         ? QStringLiteral("Applied (study)")
                         : QStringLiteral("Geometric / monthly")},
                    {QStringLiteral("GlobInc → GlobEff"),
                     QStringLiteral("%1 → %2 kWh/m²")
                         .arg(num(kpi.value(QStringLiteral("GlobInc_y")).toDouble(), 0))
                         .arg(num(kpi.value(QStringLiteral("GlobEff_y")).toDouble(), 0))}},
                   2);
        if (!monthlyLoss.isEmpty()) {
            drawPvH2(c, QStringLiteral("Monthly shading loss factor"));
            c.ensure(40);
            QString line;
            for (int i = 0; i < monthlyLoss.size() && i < 12; ++i) {
                double loss = monthlyLoss[i].toDouble();
                if (loss > 1.0)
                    loss /= 100.0;
                if (!line.isEmpty())
                    line += QStringLiteral("  ");
                line += QStringLiteral("%1:%2%")
                            .arg(i + 1)
                            .arg(num(loss * 100.0, 0));
            }
            c.para(line, 7, kText);
        }
    } else {
        c.para(QStringLiteral("Aucun ombrage proche renseigné dans le relevé de site. "
                              "Le diagramme de pertes n’applique alors que les facteurs lossTree."),
               9, kMuted);
    }
    c.y += 6;
    drawPvH2(c, QStringLiteral("Site identity"));
    drawKvGrid(c,
               {{QStringLiteral("Project"), name},
                {QStringLiteral("Client"),
                 clientName(project).isEmpty() ? QStringLiteral("—") : clientName(project)},
                {QStringLiteral("Address"), locName},
                {QStringLiteral("Install type"), installLabel(install)}},
               2);
    endPage();

    // ═══════════════ 7. PVGIS PVcalc (qualité compte-rendu JRC) ═══════════════
    drawPvBand(c, QStringLiteral("PVGIS PVcalc — Grid-connected PV"),
               QStringLiteral("Page %1").arg(pageNo));
    drawPvH1(c, QStringLiteral("7. PVGIS PVcalc report (JRC)"));

    if (pvgis.value(QStringLiteral("ok")).toBool() || pvgis.value(QStringLiteral("E_y")).toDouble() > 0) {
        drawPvH2(c, QStringLiteral("Provided inputs"));
        drawKvGrid(c,
                   {{QStringLiteral("Location"),
                     QStringLiteral("%1 °N, %2 °E%3")
                         .arg(lat, 0, 'f', 4)
                         .arg(lon, 0, 'f', 4)
                         .arg(pvgis.value(QStringLiteral("elevation")).toDouble() > 0
                                  ? QStringLiteral(" · elev. %1 m")
                                        .arg(num(pvgis.value(QStringLiteral("elevation")).toDouble(), 0))
                                  : QString())},
                    {QStringLiteral("Radiation / meteo DB"),
                     QStringLiteral("%1 / %2")
                         .arg(pvgis.value(QStringLiteral("radiation_db")).toString())
                         .arg(pvgis.value(QStringLiteral("meteo_db")).toString())},
                    {QStringLiteral("Period"),
                     (pvgis.value(QStringLiteral("year_min")).toInt() > 0)
                         ? QStringLiteral("%1–%2")
                               .arg(pvgis.value(QStringLiteral("year_min")).toInt())
                               .arg(pvgis.value(QStringLiteral("year_max")).toInt())
                         : QStringLiteral("—")},
                    {QStringLiteral("Horizon"),
                     pvgis.value(QStringLiteral("use_horizon")).toBool()
                         ? QStringLiteral("Yes (%1)")
                               .arg(pvgis.value(QStringLiteral("horizon_db")).toString())
                         : QStringLiteral("No")},
                    {QStringLiteral("Mounting"),
                     pvgis.value(QStringLiteral("mounting")).toString().isEmpty()
                         ? QStringLiteral("free-standing")
                         : pvgis.value(QStringLiteral("mounting")).toString()},
                    {QStringLiteral("Slope / azimuth"),
                     QStringLiteral("%1 ° / %2 °")
                         .arg(num(pvgis.value(QStringLiteral("tilt"), tilt).toDouble(), 1))
                         .arg(num(pvgis.value(QStringLiteral("azimuth"), azimuth).toDouble(), 1))},
                    {QStringLiteral("Peak power"),
                     QStringLiteral("%1 kWp")
                         .arg(num(pvgis.value(QStringLiteral("peakpower"), ppeak).toDouble(), 2))},
                    {QStringLiteral("System loss"),
                     QStringLiteral("%1 %")
                         .arg(num(pvgis.value(QStringLiteral("loss"),
                                              form.value(QStringLiteral("losses"), 14))
                                      .toDouble(),
                                  1))}},
                   2);

        drawPvH2(c, QStringLiteral("Yearly totals"));
        drawKvGrid(c,
                   {{QStringLiteral("E_y (energy)"),
                     QStringLiteral("%1 kWh/y").arg(num(pvgis.value(QStringLiteral("E_y")).toDouble(), 1))},
                    {QStringLiteral("H(i)_y (irradiation)"),
                     QStringLiteral("%1 kWh/m²/y")
                         .arg(num(pvgis.value(QStringLiteral("H_i_y")).toDouble(), 1))},
                    {QStringLiteral("E_d (daily avg)"),
                     QStringLiteral("%1 kWh/d").arg(num(pvgis.value(QStringLiteral("E_d")).toDouble(), 2))},
                    {QStringLiteral("H(i)_d (daily avg)"),
                     QStringLiteral("%1 kWh/m²/d")
                         .arg(num(pvgis.value(QStringLiteral("H_i_d")).toDouble(), 2))},
                    {QStringLiteral("SD_y (year-to-year)"),
                     QStringLiteral("%1 kWh").arg(num(pvgis.value(QStringLiteral("SD_y")).toDouble(), 1))},
                    {QStringLiteral("Specific yield"),
                     [&]() {
                         const double pp = pvgis.value(QStringLiteral("peakpower"), ppeak).toDouble();
                         const double ey = pvgis.value(QStringLiteral("E_y")).toDouble();
                         return pp > 0 ? QStringLiteral("%1 kWh/kWp/y").arg(num(ey / pp, 0))
                                       : QStringLiteral("—");
                     }()}},
                   2);

        drawPvH2(c, QStringLiteral("Spectral / angle / temperature losses"));
        drawKvGrid(c,
                   {{QStringLiteral("l_aoi (AOI)"),
                     QStringLiteral("%1 %").arg(num(pvgis.value(QStringLiteral("l_aoi")).toDouble(), 2))},
                    {QStringLiteral("l_spec (spectral)"),
                     QStringLiteral("%1 %").arg(pvgis.value(QStringLiteral("l_spec")).toString())},
                    {QStringLiteral("l_tg (temp. + irradiance)"),
                     QStringLiteral("%1 %").arg(num(pvgis.value(QStringLiteral("l_tg")).toDouble(), 2))},
                    {QStringLiteral("l_total"),
                     QStringLiteral("%1 %")
                         .arg(num(pvgis.value(QStringLiteral("l_total")).toDouble(), 2))}},
                   2);

        const QVariantList pvgisMonths = pvgis.value(QStringLiteral("monthly")).toList();
        drawPvgisMonthlyTable(c, pvgisMonths, pvgis);
        // Graphiques type PDF web PVGIS
        if (!pvgisMonths.isEmpty()) {
            endPage();
            drawPvBand(c, QStringLiteral("PVGIS PVcalc — charts"),
                       QStringLiteral("Page %1").arg(pageNo));
            drawPvH1(c, QStringLiteral("7b. PVGIS monthly charts"));
            drawSimpleMonthlyBars(c, pvgisMonths, QStringLiteral("E_m"),
                                  QStringLiteral("Monthly energy E_m (kWh)"), kPvBar);
            drawSimpleMonthlyBars(c, pvgisMonths, QStringLiteral("H_i_m"),
                                  QStringLiteral("Monthly irradiation H(i)_m (kWh/m²)"), kPvNavy);

            drawPvH2(c, QStringLiteral("OSE vs PVGIS"));
            const double ey = pvgis.value(QStringLiteral("E_y")).toDouble();
            const double oseE = eGrid > 0 ? eGrid : eAnnual;
            drawKvGrid(c,
                       {{QStringLiteral("E_y PVGIS"), QStringLiteral("%1 kWh/y").arg(num(ey, 0))},
                        {QStringLiteral("E_Grid OSE"), QStringLiteral("%1 kWh/y").arg(num(oseE, 0))},
                        {QStringLiteral("Deviation"),
                         ey > 0 ? QStringLiteral("%1%2 %")
                                      .arg((oseE - ey) >= 0 ? QStringLiteral("+") : QString())
                                      .arg(num((oseE - ey) / ey * 100.0, 1))
                                : QStringLiteral("—")},
                        {QStringLiteral("H(i)_y PVGIS"),
                         QStringLiteral("%1 kWh/m²")
                             .arg(num(pvgis.value(QStringLiteral("H_i_y")).toDouble(), 0))},
                        {QStringLiteral("GlobInc OSE"),
                         QStringLiteral("%1 kWh/m²")
                             .arg(num(kpi.value(QStringLiteral("GlobInc_y")).toDouble(), 0))}},
                       2);
        }
    } else {
        c.para(QStringLiteral("Aucune simulation PVcalc enregistrée sur ce projet. "
                              "Onglet Lieu → « Comparer PVcalc » pour importer le compte rendu JRC "
                              "(E_d / E_m / H(i) / l_aoi / l_tg / SD_y)."),
               9, kMuted);
    }

    // Tableau OSE au même format que PVGIS (toujours)
    if (!balMonths.isEmpty()) {
        c.y += 4;
        drawOsePvgisStyleTable(c, balMonths);
    }
    endPage();

    // ═══════════════ 8. METHOD ═══════════════
    drawPvBand(c, QStringLiteral("Methodology"),
               QStringLiteral("Page %1").arg(pageNo));
    drawPvH1(c, QStringLiteral("8. Methodology & limits"));
    c.para(QStringLiteral(
               "• Structure type PVsyst grid-connected : balances GlobHor→E_Grid, PR IEC 61724, "
               "loss diagram séquentiel, indices Yr/Ya/Yf.\n"
               "• Annexe PVGIS : restitution du JSON PVcalc JRC (mêmes blocs qu’un PDF web PVGIS) — "
               "inputs, totaux, pertes l_aoi/l_spec/l_tg, tableau mensuel E_d/E_m/H(i)_d/H(i)_m/SD_m, "
               "graphiques E_m et H(i)_m.\n"
               "• Productible OSE : météo projet + transposition ; ombrage site si renseigné ; "
               "mode Study = profil horaire si disponible.\n"
               "• LossTree = facteurs utilisateur (soiling, IAM, mismatch…) en chaîne.\n"
               "• Hors périmètre : .PAN/.OND constructeur, schéma unifilaire détaillé, Consuel / Enedis.\n"
               "• Ce rapport n’est pas un devis commercial."),
           8, kMuted);
    c.y += 16;
    c.setFont(9, true);
    c.p->setPen(kPvNavy);
    c.p->drawText(c.margin, c.y,
                  QStringLiteral("End of report — Open Solar Energy %1")
                      .arg(QStringLiteral(OSE_APP_VERSION)));
    drawFooter(c, QStringLiteral("%1 — %2").arg(name, variant), pageNo);
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
