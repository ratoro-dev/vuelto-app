package uy.rumbo.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;
import android.util.ArrayMap;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;
import java.util.Map;
import org.json.JSONObject;

/** Lo que queda del presupuesto del mes. Desde 4×2 suma accesos para dictar, sacar foto o leer el QR. */
public class DisponibleWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        update(context, manager, ids);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        update(context, manager, new int[] { id });
    }

    static void update(Context context, AppWidgetManager manager, int[] ids) {
        JSONObject s = RumboWidgetData.load(context);
        for (int id : ids) manager.updateAppWidget(id, views(context, manager, id, s));
    }

    private static RemoteViews views(Context context, AppWidgetManager manager, int id, JSONObject s) {
        RemoteViews small = build(context, s, R.layout.widget_disponible_small);
        RemoteViews medium = build(context, s, R.layout.widget_disponible_medium);
        if (Build.VERSION.SDK_INT >= 31) {
            Map<SizeF, RemoteViews> bySize = new ArrayMap<>();
            bySize.put(new SizeF(100f, 100f), small);
            bySize.put(new SizeF(250f, 100f), medium);
            return new RemoteViews(bySize);
        }
        int minWidth = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH);
        return minWidth >= 250 ? medium : small;
    }

    private static RemoteViews build(Context context, JSONObject s, int layout) {
        RemoteViews v = new RemoteViews(context.getPackageName(), layout);
        boolean empty = s.length() == 0;
        v.setTextViewText(R.id.widget_month, empty ? "Abrí Rumbo para ver tu mes" : "Disponible en " + s.optString("month"));
        v.setTextViewText(R.id.widget_available, empty ? "—" : s.optString("availableText"));
        v.setTextColor(R.id.widget_available, context.getColor(s.optBoolean("over") ? R.color.rb_warn : R.color.rb_ink));
        v.setTextViewText(R.id.widget_spent, empty ? "" : "Gastado " + s.optString("spentText"));
        int pending = s.optInt("pendingCount");
        v.setTextViewText(R.id.widget_pending, pending > 0 ? pending + " por subir" : "");

        double used = Math.max(0, Math.min(1, s.optDouble("usedShare", 0)));
        boolean warn = s.optBoolean("over") || used > 0.9;
        v.setViewVisibility(R.id.widget_progress, warn ? View.GONE : View.VISIBLE);
        v.setViewVisibility(R.id.widget_progress_warn, warn ? View.VISIBLE : View.GONE);
        v.setProgressBar(warn ? R.id.widget_progress_warn : R.id.widget_progress, 100, (int) Math.round(used * 100), false);

        v.setOnClickPendingIntent(R.id.widget_root, RumboWidgetData.link(context, "rumbo://inicio", 10));
        if (layout == R.layout.widget_disponible_medium) {
            v.setOnClickPendingIntent(R.id.widget_btn_voz, RumboWidgetData.link(context, "rumbo://registrar?modo=voz&escuchar=1", 11));
            v.setOnClickPendingIntent(R.id.widget_btn_foto, RumboWidgetData.link(context, "rumbo://registrar?modo=foto", 12));
            v.setOnClickPendingIntent(R.id.widget_btn_qr, RumboWidgetData.link(context, "rumbo://registrar?modo=qr", 13));
        }
        return v;
    }
}
