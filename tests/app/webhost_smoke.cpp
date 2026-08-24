#include <QCoreApplication>
#include <QTest>

#include "app/webhost.h"

class WebHostSmoke : public QObject {
    Q_OBJECT
private slots:
    void servesIndex();
};

void WebHostSmoke::servesIndex()
{
    app::WebHost host;
    const QString root = qEnvironmentVariable("OSE_WEB_ROOT");
    QVERIFY(!root.isEmpty());
    QVERIFY(host.start(root));
    QVERIFY(host.baseUrl().isValid());
}

QTEST_MAIN(WebHostSmoke)
#include "webhost_smoke.moc"
