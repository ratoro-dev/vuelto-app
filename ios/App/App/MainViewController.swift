import Capacitor
import UIKit

/// Controlador principal: el de Capacitor más los plugins propios de la app.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(PaperVisionPlugin())
        bridge?.registerPluginInstance(OfflineSpeechPlugin())
        bridge?.registerPluginInstance(RumboWidgetsPlugin())
    }
}
