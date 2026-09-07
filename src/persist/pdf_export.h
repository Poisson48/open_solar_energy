#pragma once

#include <QObject>

namespace ose {

class PdfExport : public QObject {
    Q_OBJECT
public:
    explicit PdfExport(QObject* parent = nullptr);

    /** Génère un PDF devis simple ; retourne le chemin fichier ou vide. */
    Q_INVOKABLE QString exportQuote(const QString& title, const QString& client,
                                    const QVariantList& lines, double tvaRate = 0.1);
};

} // namespace ose
