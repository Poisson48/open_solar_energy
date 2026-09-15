#include "sync_paths.h"

namespace ose {

QJsonValue jsonGetPath(const QJsonObject& root, const QString& path)
{
    const QStringList parts = path.split(QLatin1Char('.'), Qt::SkipEmptyParts);
    if (parts.isEmpty())
        return {};
    QJsonValue cur = root.value(parts.first());
    for (int i = 1; i < parts.size(); ++i) {
        if (!cur.isObject())
            return {};
        cur = cur.toObject().value(parts.at(i));
    }
    return cur;
}

void jsonSetPath(QJsonObject& root, const QString& path, const QJsonValue& value)
{
    const QStringList parts = path.split(QLatin1Char('.'), Qt::SkipEmptyParts);
    if (parts.isEmpty())
        return;
    if (parts.size() == 1) {
        root.insert(parts.first(), value);
        return;
    }
    // Nested: walk / create objects until last key
    QList<QJsonObject> stack;
    stack.append(root);
    for (int i = 0; i < parts.size() - 1; ++i) {
        QJsonObject node = stack.last().value(parts.at(i)).toObject();
        stack.append(node);
    }
    stack.last().insert(parts.last(), value);
    for (int i = parts.size() - 2; i >= 0; --i) {
        QJsonObject parent = stack.at(i);
        parent.insert(parts.at(i), stack.at(i + 1));
        stack[i] = parent;
    }
    root = stack.first();
}

} // namespace ose
