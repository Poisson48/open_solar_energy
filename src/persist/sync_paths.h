#pragma once

#include <QJsonObject>
#include <QJsonValue>
#include <QString>

namespace ose {

/** Lit une valeur JSON par chemin pointé (ex. formState.tilt, siteSurvey). */
QJsonValue jsonGetPath(const QJsonObject& root, const QString& path);

/** Écrit une valeur ; crée les objets intermédiaires (2 niveaux max utiles). */
void jsonSetPath(QJsonObject& root, const QString& path, const QJsonValue& value);

} // namespace ose
