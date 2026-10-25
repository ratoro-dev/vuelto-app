package uy.rumbo.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;

/** Registrar a un toque: Voz (ya escuchando), Texto (el teclado), Foto y QR (la cámara). No depende de los datos. */
public class RegistrarWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_registrar);
            v.setOnClickPendingIntent(R.id.widget_tile_voz, RumboWidgetData.link(context, "rumbo://registrar?modo=voz&escuchar=1", 30));
            v.setOnClickPendingIntent(R.id.widget_tile_texto, RumboWidgetData.link(context, "rumbo://registrar?modo=texto", 31));
            v.setOnClickPendingIntent(R.id.widget_tile_foto, RumboWidgetData.link(context, "rumbo://registrar?modo=foto", 32));
            v.setOnClickPendingIntent(R.id.widget_tile_qr, RumboWidgetData.link(context, "rumbo://registrar?modo=qr", 33));
            manager.updateAppWidget(id, v);
        }
    }
}
