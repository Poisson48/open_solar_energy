#pragma once

#include <QObject>
#include <QColor>

namespace app {

class Theme : public QObject {
    Q_OBJECT
    Q_PROPERTY(QColor primary READ primary CONSTANT)
    Q_PROPERTY(QColor primaryHover READ primaryHover CONSTANT)
    Q_PROPERTY(QColor primaryActive READ primaryActive CONSTANT)
    Q_PROPERTY(QColor primarySubtle READ primarySubtle CONSTANT)
    Q_PROPERTY(QColor primaryLight READ primaryLight CONSTANT)
    Q_PROPERTY(QColor accent READ accent CONSTANT)
    Q_PROPERTY(QColor background READ background CONSTANT)
    Q_PROPERTY(QColor surface READ surface CONSTANT)
    Q_PROPERTY(QColor surfaceHigh READ surfaceHigh CONSTANT)
    Q_PROPERTY(QColor surfaceSunken READ surfaceSunken CONSTANT)
    Q_PROPERTY(QColor text READ text CONSTANT)
    Q_PROPERTY(QColor textDim READ textDim CONSTANT)
    Q_PROPERTY(QColor textSecondary READ textSecondary CONSTANT)
    Q_PROPERTY(QColor outline READ outline CONSTANT)
    Q_PROPERTY(QColor outlineStrong READ outlineStrong CONSTANT)
    Q_PROPERTY(QColor danger READ danger CONSTANT)
    Q_PROPERTY(QColor dangerBg READ dangerBg CONSTANT)
    Q_PROPERTY(QColor warning READ warning CONSTANT)
    Q_PROPERTY(QColor warningBg READ warningBg CONSTANT)
    Q_PROPERTY(QColor success READ success CONSTANT)
    Q_PROPERTY(QColor successBg READ successBg CONSTANT)
    Q_PROPERTY(int radius READ radius CONSTANT)
    Q_PROPERTY(int radiusControl READ radiusControl CONSTANT)
    Q_PROPERTY(int radiusCard READ radiusCard CONSTANT)
    Q_PROPERTY(int gap READ gap CONSTANT)
    Q_PROPERTY(int spaceXs READ spaceXs CONSTANT)
    Q_PROPERTY(int spaceSm READ spaceSm CONSTANT)
    Q_PROPERTY(int spaceMd READ spaceMd CONSTANT)
    Q_PROPERTY(int spaceLg READ spaceLg CONSTANT)
    Q_PROPERTY(int spaceXl READ spaceXl CONSTANT)
    Q_PROPERTY(int touchTarget READ touchTarget CONSTANT)
    Q_PROPERTY(int controlHeightMd READ controlHeightMd CONSTANT)
    Q_PROPERTY(int fontSizePageTitle READ fontSizePageTitle CONSTANT)
    Q_PROPERTY(int fontSizeCardTitle READ fontSizeCardTitle CONSTANT)
    Q_PROPERTY(int fontSizeBody READ fontSizeBody CONSTANT)
    Q_PROPERTY(int fontSizeCaption READ fontSizeCaption CONSTANT)
    Q_PROPERTY(int fontSizeKpi READ fontSizeKpi CONSTANT)

public:
    explicit Theme(QObject* parent = nullptr);

    QColor primary() const { return QColor("#1a6b3c"); }
    QColor primaryHover() const { return QColor("#175f35"); }
    QColor primaryActive() const { return QColor("#114b29"); }
    QColor primarySubtle() const { return QColor("#e9f3ed"); }
    QColor primaryLight() const { return QColor("#2d9e5c"); }
    QColor accent() const { return QColor("#f5a623"); }
    QColor background() const { return QColor("#f4f6f5"); }
    QColor surface() const { return QColor("#ffffff"); }
    QColor surfaceHigh() const { return QColor("#f0f4f2"); }
    QColor surfaceSunken() const { return QColor("#eef2f0"); }
    QColor text() const { return QColor("#1a2e23"); }
    QColor textDim() const { return QColor("#4d5f56"); }
    QColor textSecondary() const { return textDim(); }
    QColor outline() const { return QColor("#d0dbd5"); }
    QColor outlineStrong() const { return QColor("#a8bdb0"); }
    QColor danger() const { return QColor("#b42318"); }
    QColor dangerBg() const { return QColor("#fdecea"); }
    QColor warning() const { return QColor("#b54708"); }
    QColor warningBg() const { return QColor("#fff4e5"); }
    QColor success() const { return QColor("#1a6b3c"); }
    QColor successBg() const { return QColor("#e9f3ed"); }
    int radius() const { return 6; }
    int radiusControl() const { return 4; }
    int radiusCard() const { return 6; }
    int gap() const { return 12; }
    int spaceXs() const { return 4; }
    int spaceSm() const { return 8; }
    int spaceMd() const { return 12; }
    int spaceLg() const { return 16; }
    int spaceXl() const { return 24; }
    int touchTarget() const { return 44; }
    int controlHeightMd() const { return 32; }
    int fontSizePageTitle() const { return 22; }
    int fontSizeCardTitle() const { return 15; }
    int fontSizeBody() const { return 13; }
    int fontSizeCaption() const { return 12; }
    int fontSizeKpi() const { return 24; }
};

} // namespace app
