package uy.rumbo.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Puente entre la app y los widgets de Android: guarda el resumen y los vuelve a dibujar. */
@CapacitorPlugin(name = "RumboWidgets")
public class RumboWidgetsPlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        String json = call.getString("snapshot");
        if (json == null) {
            call.reject("Falta el resumen para los widgets.");
            return;
        }
        RumboWidgetData.save(getContext(), json);
        RumboWidgetData.updateAll(getContext());
        call.resolve();
    }

    /** En Android no hay nada anotado por fuera de la app (Siri es solo del iPhone). */
    @PluginMethod
    public void takeInbox(PluginCall call) {
        JSObject result = new JSObject();
        result.put("items", new JSArray());
        call.resolve(result);
    }
}
