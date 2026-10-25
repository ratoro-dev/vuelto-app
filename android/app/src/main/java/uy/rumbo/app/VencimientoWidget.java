package uy.rumbo.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;
import org.json.JSONObject;

/** La próxima factura sin pagar, en rojizo si vence en 2 días o menos. */
public class VencimientoWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        update(context, manager, ids);
    }

    static void update(Context context, AppWidgetManager manager, int[] ids) {
        JSONObject s = RumboWidgetData.load(context);
        JSONObject bill = s.optJSONObject("nextBill");
        for (int id : ids) {
            RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_vencimiento);
            if (bill != null) {
                v.setTextViewText(R.id.widget_bill_name, bill.optString("name"));
                v.setTextViewText(R.id.widget_bill_amount, bill.optString("amountText"));
                v.setTextViewText(R.id.widget_bill_due, bill.optString("dueText"));
                v.setTextColor(R.id.widget_bill_due, context.getColor(bill.optBoolean("soon") ? R.color.rb_warn : R.color.rb_muted));
            } else {
                v.setTextViewText(R.id.widget_bill_name, s.length() == 0 ? "Abrí Rumbo para ver tus facturas" : "Nada por vencer este mes");
                v.setTextViewText(R.id.widget_bill_amount, "");
                v.setTextViewText(R.id.widget_bill_due, "");
            }
            v.setOnClickPendingIntent(R.id.widget_root, RumboWidgetData.link(context, "rumbo://facturas", 20));
            manager.updateAppWidget(id, v);
        }
    }
}
