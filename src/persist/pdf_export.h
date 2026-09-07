#pragma once

#include <QObject>
#include <QVariantList>
#include <QVariantMap>

namespace ose {

class PdfExport : public QObject {
    Q_OBJECT
public:
    explicit PdfExport(QObject* parent = nullptr);

    /** Devis PDF simple (rétrocompat tests). */
    Q_INVOKABLE QString exportQuote(const QString& title, const QString& client,
                                    const QVariantList& lines, double tvaRate = 0.1);

    /**
     * Devis professionnel FR (SIRET/RGE, client, chantier, lignes qté/PU,
     * remise, TVA, validité, signature) à partir du projet courant.
     * opts: lines, tvaRate, remisePct, validityDays, notes, ref
     */
    Q_INVOKABLE QString exportProfessionalQuote(const QVariantMap& project,
                                                const QVariantMap& opts = {});

    /**
     * Rapport de simulation multi-pages (style étude PVsyst) :
     * site, météo, système, bilan mensuel, ombrage, finances, hors-réseau.
     */
    Q_INVOKABLE QString exportSimulationReport(const QVariantMap& project);

    /** Rend les pages PDF en PNG (aperçu) ; [{page, path, width, height}, …]. */
    Q_INVOKABLE QVariantList previewPages(const QString& pdfPath, int maxPages = 8) const;

    Q_INVOKABLE bool openPdf(const QString& path) const;
};

} // namespace ose
