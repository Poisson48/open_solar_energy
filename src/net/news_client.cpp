#include "news_client.h"

#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QRegularExpression>
#include <QXmlStreamReader>

#ifndef OSE_APP_VERSION
#  define OSE_APP_VERSION "0.0.0"
#endif

namespace ose {

NewsClient::NewsClient(QObject* parent) : QObject(parent), m_nam(new QNetworkAccessManager(this))
{
    m_items = {
        QVariantMap{{QStringLiteral("ver"), QStringLiteral(OSE_APP_VERSION)},
                    {QStringLiteral("notes"),
                     QStringLiteral("Shell natif QML — réécriture en cours.")}},
    };
}

void NewsClient::refresh()
{
    if (m_busy)
        return;
    m_busy = true;
    emit busyChanged();

    const QUrl url(QStringLiteral(
        "https://github.com/Poisson48/open_solar_energy/releases.atom"));
    QNetworkReply* reply = m_nam->get(QNetworkRequest(url));
    connect(reply, &QNetworkReply::finished, this, [this, reply]() {
        reply->deleteLater();
        m_busy = false;
        emit busyChanged();
        if (reply->error() != QNetworkReply::NoError)
            return;

        QXmlStreamReader xml(reply->readAll());
        QVariantList items;
        QString title;
        QString summary;
        while (!xml.atEnd()) {
            xml.readNext();
            if (xml.isStartElement()) {
                if (xml.name() == QLatin1String("entry")) {
                    title.clear();
                    summary.clear();
                } else if (xml.name() == QLatin1String("title")) {
                    title = xml.readElementText();
                } else if (xml.name() == QLatin1String("content")
                           || xml.name() == QLatin1String("summary")) {
                    summary = xml.readElementText(QXmlStreamReader::IncludeChildElements);
                    summary.remove(QRegularExpression(QStringLiteral("<[^>]+>")));
                }
            } else if (xml.isEndElement() && xml.name() == QLatin1String("entry")) {
                items.append(QVariantMap{{QStringLiteral("ver"), title},
                                         {QStringLiteral("notes"), summary.left(240)}});
                if (items.size() >= 8)
                    break;
            }
        }
        if (!items.isEmpty()) {
            m_items = items;
            emit itemsChanged();
        }
    });
}

} // namespace ose
