package uy.rumbo.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import org.json.JSONObject;

/**
 * El resumen que arma la app (src/domain/widgets.ts → WidgetSnapshot), guardado para los widgets.
 * Los widgets no recalculan nada: muestran los textos que dejó la app la última vez que se abrió.
 */
final class RumboWidgetData {

    private static final String PREFS = "rumbo_widgets";
    private static final String KEY = "snapshot";

    private RumboWidgetData() {}

    static void save(Context context, String json) {
        prefs(context).edit().putString(KEY, json).apply();
    }

    /** El resumen guardado o, antes de abrir la app por primera vez, uno vacío. */
    static JSONObject load(Context context) {
        try {
            String json = prefs(context).getString(KEY, null);
            if (json != null) return new JSONObject(json);
        } catch (Exception ignored) {}
        return new JSONObject();
    }

    /** Vuelve a dibujar todos los widgets de Rumbo que estén en la pantalla de inicio. */
    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        DisponibleWidget.update(context, manager, manager.getAppWidgetIds(new ComponentName(context, DisponibleWidget.class)));
        VencimientoWidget.update(context, manager, manager.getAppWidgetIds(new ComponentName(context, VencimientoWidget.class)));
    }

    /** Abre la app en un link rumbo://… (lo resuelve src/domain/deepLinks.ts). */
    static PendingIntent link(Context context, String url, int requestCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.setPackage(context.getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
