import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Flickable {
    contentHeight: col.implicitHeight + 24
    clip: true
    ColumnLayout {
        id: col
        width: parent.width
        x: 16; y: 16
        spacing: 12
        Label { text: "Météo mensuelle"; font.pixelSize: 20; font.weight: Font.DemiBold }
        SimpleBarChart {
            Layout.fillWidth: true
            Layout.preferredHeight: 160
            values: {
                const w = Projects.currentProject.weatherData || []
                let out = []
                for (let i = 0; i < w.length; ++i) out.push(w[i].GHI || 0)
                return out
            }
        }
        SimpleBarChart {
            Layout.fillWidth: true
            Layout.preferredHeight: 120
            barColor: Theme.accent
            values: {
                const w = Projects.currentProject.weatherData || []
                let out = []
                for (let i = 0; i < w.length; ++i) out.push(w[i].T_avg || 0)
                return out
            }
        }
        Label { text: "Haut : GHI · Bas : T° moyenne"; color: Theme.textDim; font.pixelSize: 12 }
    }
}
