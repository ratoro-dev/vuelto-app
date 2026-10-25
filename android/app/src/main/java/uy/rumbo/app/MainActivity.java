package uy.rumbo.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins propios de la app: se registran antes de que arranque el puente
        registerPlugin(OfflineSpeechPlugin.class);
        registerPlugin(RumboWidgetsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
