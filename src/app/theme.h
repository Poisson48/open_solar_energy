#pragma once

#include <QObject>
#include <QColor>

namespace app {

class Theme : public QObject {
    Q_OBJECT
    Q_PROPERTY(QColor primary READ primary CONSTANT)
    Q_PROPERTY(QColor primaryLight READ primaryLight CONSTANT)
    Q_PROPERTY(QColor accent READ accent CONSTANT)
    Q_PROPERTY(QColor background READ background CONSTANT)
    Q_PROPERTY(QColor surface READ surface CONSTANT)
    Q_PROPERTY(QColor surfaceHigh READ surfaceHigh CONSTANT)
    Q_PROPERTY(QColor text READ text CONSTANT)
    Q_PROPERTY(QColor textDim READ textDim CONSTANT)
    Q_PROPERTY(QColor outline READ outline CONSTANT)
    Q_PROPERTY(int radius READ radius CONSTANT)
    Q_PROPERTY(int gap READ gap CONSTANT)
    Q_PROPERTY(int touchTarget READ touchTarget CONSTANT)

public:
    explicit Theme(QObject* parent = nullptr);

    QColor primary() const { return QColor("#1a6b3c"); }
    QColor primaryLight() const { return QColor("#2d9e5c"); }
    QColor accent() const { return QColor("#f5a623"); }
    QColor background() const { return QColor("#f4f6f5"); }
    QColor surface() const { return QColor("#ffffff"); }
    QColor surfaceHigh() const { return QColor("#f0f4f2"); }
    QColor text() const { return QColor("#1a2e23"); }
    QColor textDim() const { return QColor("#5a7265"); }
    QColor outline() const { return QColor("#d0dbd5"); }
    int radius() const { return 6; }
    int gap() const { return 12; }
    int touchTarget() const { return 44; }
};

} // namespace app
