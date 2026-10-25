package uy.rumbo.app;

import android.Manifest;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognitionSupport;
import android.speech.RecognitionSupportCallback;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONException;

/**
 * Dictado de gastos con el reconocimiento de voz de Android. Usa el reconocedor dentro del teléfono
 * cuando hay uno con español instalado; si no, el de Google pidiéndole que prefiera lo descargado.
 */
@CapacitorPlugin(name = "OfflineSpeech", permissions = { @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone") })
public class OfflineSpeechPlugin extends Plugin {

    private static final String TAG = "OfflineSpeech";
    /** El español de acá primero; si no está, el más parecido. */
    private static final String[] LOCALES = { "es-UY", "es-AR", "es-419", "es-US", "es-MX", "es-ES" };

    private final Handler main = new Handler(Looper.getMainLooper());
    private SpeechRecognizer recognizer;
    /** Todo lo entendido: los tramos ya cerrados más el que se está diciendo. */
    private String text = "";
    /** El reconocedor del teléfono empieza de cero después de las pausas: lo dicho antes se guarda acá. */
    private String committed = "";
    /** El tramo que se está diciendo ahora. */
    private String segment = "";
    private PluginCall stopCall;
    /** El `start` se responde cuando el micrófono ya escucha, para que la pantalla no diga "Escuchando" antes de tiempo. */
    private PluginCall startCall;
    private JSObject startResult;
    /**
     * El reconocedor del teléfono corta la sesión en cada pausa larga. Mientras la persona no toque para terminar,
     * se vuelve a abrir con el mismo pedido y se sigue sumando el texto (hasta MAX_DICTATION_MS).
     */
    private Intent currentIntent;
    private boolean stopping = false;
    /** El reconocedor está escuchando ahora (no está entre una sesión y la siguiente). */
    private boolean active = false;
    private long startedAt = 0;
    private static final long MAX_DICTATION_MS = 120_000;
    /** Cada dictado tiene su número, para que lo que llega tarde de uno anterior no corte el actual. */
    private int session = 0;
    private boolean running = false;
    /** Español instalado en el reconocedor dentro del teléfono (Android 13 o más); null si no hay. */
    private String onDeviceLocale;

    @PluginMethod
    public void availability(PluginCall call) {
        boolean online = SpeechRecognizer.isRecognitionAvailable(getContext());
        boolean onDevice = Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(getContext());
        JSObject result = new JSObject();
        result.put("permission", permissionName());
        if (onDevice && Build.VERSION.SDK_INT >= 33) {
            main.post(() -> checkOnDevice(call, result, online));
            return;
        }
        result.put("available", online || onDevice);
        // Sin poder preguntarle al reconocedor, no sabemos si tiene el español descargado
        result.put("offline", false);
        result.put("locale", LOCALES[0]);
        Log.i(TAG, "disponible: " + online + " · dentro del teléfono: " + onDevice);
        call.resolve(result);
    }

    @RequiresApi(33)
    private void checkOnDevice(PluginCall call, JSObject result, boolean online) {
        SpeechRecognizer probe = SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext());
        probe.checkRecognitionSupport(
            intentFor(LOCALES[0]),
            ContextCompat.getMainExecutor(getContext()),
            new RecognitionSupportCallback() {
                @Override
                public void onSupportResult(@NonNull RecognitionSupport support) {
                    onDeviceLocale = spanish(support.getInstalledOnDeviceLanguages());
                    String downloadable = spanish(support.getSupportedOnDeviceLanguages());
                    boolean pending = spanish(support.getPendingOnDeviceLanguages()) != null;
                    // Si se puede bajar el español, lo pide; mientras tanto dicta por internet
                    if (onDeviceLocale == null && downloadable != null && !pending) {
                        probe.triggerModelDownload(intentFor(downloadable));
                    }
                    Log.i(TAG, "dentro del teléfono: " + onDeviceLocale + " · descargable: " + downloadable + " · bajando: " + pending);
                    result.put("available", online || onDeviceLocale != null);
                    result.put("offline", onDeviceLocale != null);
                    result.put("downloading", onDeviceLocale == null && (pending || downloadable != null));
                    result.put("locale", onDeviceLocale != null ? onDeviceLocale : LOCALES[0]);
                    probe.destroy();
                    call.resolve(result);
                }

                @Override
                public void onError(int error) {
                    Log.i(TAG, "no se pudo consultar el reconocedor del teléfono: " + error);
                    result.put("available", online);
                    result.put("offline", false);
                    result.put("locale", LOCALES[0]);
                    probe.destroy();
                    call.resolve(result);
                }
            }
        );
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphoneResult");
            return;
        }
        main.post(() -> begin(call));
    }

    @PermissionCallback
    private void microphoneResult(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            main.post(() -> begin(call));
        } else {
            call.reject("Rumbo necesita el micrófono para dictar. Activalo en Ajustes → Apps → Rumbo.", "permission");
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        main.post(() -> {
            if (!running || recognizer == null) {
                call.resolve(textResult());
                return;
            }
            stopCall = call;
            stopping = true;
            // Entre una sesión y la siguiente no hay nada que esperar
            if (!active) {
                finish(null);
                return;
            }
            recognizer.stopListening();
            // Si el resultado final no llega, devuelve lo último que entendió
            int mine = session;
            main.postDelayed(() -> {
                if (session == mine) finish(null);
            }, 2500);
        });
    }

    private void begin(PluginCall call) {
        finish(null);
        destroyRecognizer();
        boolean onDevice = onDeviceLocale != null && Build.VERSION.SDK_INT >= 31;
        String locale = onDevice ? onDeviceLocale : LOCALES[0];
        recognizer = onDevice ? SpeechRecognizer.createOnDeviceSpeechRecognizer(getContext()) : SpeechRecognizer.createSpeechRecognizer(getContext());
        session += 1;
        int mine = session;
        text = "";
        committed = "";
        segment = "";
        running = true;
        stopping = false;
        startedAt = System.currentTimeMillis();
        recognizer.setRecognitionListener(listener(mine));

        Intent intent = intentFor(locale);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        // Pausas largas: la persona piensa el monto o el comercio mientras habla
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500);
        intent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2500);
        JSArray hints = call.getArray("hints");
        if (hints != null && Build.VERSION.SDK_INT >= 33) {
            try {
                intent.putStringArrayListExtra(RecognizerIntent.EXTRA_BIASING_STRINGS, new ArrayList<>(hints.<String>toList()));
            } catch (JSONException ignored) {}
        }
        currentIntent = intent;
        active = true;
        recognizer.startListening(intent);

        startResult = new JSObject();
        startResult.put("offline", onDevice);
        startResult.put("locale", locale);
        startCall = call;
        // Si el aviso de "listo" no llega, igual se arranca
        main.postDelayed(() -> {
            if (session == mine) resolveStart();
        }, 2500);
    }

    /** Si la persona sigue dictando, abre otra sesión; si no, termina. */
    private void continueOrFinish(int mine, String error) {
        active = false;
        boolean keepGoing = !stopping && running && System.currentTimeMillis() - startedAt < MAX_DICTATION_MS;
        if (!keepGoing) {
            finish(error);
            return;
        }
        Log.d(TAG, "pausa: vuelve a escuchar");
        main.postDelayed(() -> {
            if (session != mine || !running || stopping || recognizer == null) return;
            active = true;
            recognizer.startListening(currentIntent);
        }, 150);
    }

    private void resolveStart() {
        if (startCall == null) return;
        PluginCall call = startCall;
        startCall = null;
        call.resolve(startResult);
    }

    /** Junta los tramos: si lo nuevo no continúa lo anterior, lo anterior ya quedó dicho. */
    private void receive(String current, boolean closesSegment) {
        if (isNewSegment(segment, current)) commit(segment);
        segment = current;
        if (closesSegment) {
            commit(segment);
            segment = "";
        }
        text = join(committed, segment);
    }

    private void commit(String piece) {
        if (piece != null && !piece.trim().isEmpty()) committed = join(committed, piece);
    }

    private static String join(String a, String b) {
        String left = a == null ? "" : a.trim();
        String right = b == null ? "" : b.trim();
        if (left.isEmpty()) return right;
        if (right.isEmpty()) return left;
        return left + " " + right;
    }

    /** Lo mismo que en iOS: las correcciones conservan la primera palabra y no pierden varias palabras. */
    static boolean isNewSegment(String previous, String current) {
        String[] p = words(previous);
        String[] c = words(current);
        if (p.length == 0 || c.length == 0) return false;
        if (c.length + 2 <= p.length) return true;
        if (p.length <= 1) return false;
        return !p[0].equals(c[0]);
    }

    private static String[] words(String s) {
        if (s == null) return new String[0];
        String plain = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase().trim();
        return plain.isEmpty() ? new String[0] : plain.split("\\s+");
    }

    private RecognitionListener listener(int mine) {
        return new RecognitionListener() {
            @Override
            public void onPartialResults(Bundle partial) {
                if (session != mine) return;
                String best = best(partial);
                if (best == null || best.isEmpty()) return;
                Log.d(TAG, "parcial: " + best);
                receive(best, false);
                JSObject data = new JSObject();
                data.put("text", text);
                notifyListeners("partial", data);
            }

            @Override
            public void onResults(Bundle results) {
                if (session != mine) return;
                String best = best(results);
                Log.d(TAG, "final: " + best);
                if (best != null && !best.isEmpty()) {
                    receive(best, true);
                    JSObject data = new JSObject();
                    data.put("text", text);
                    notifyListeners("partial", data);
                }
                continueOrFinish(mine, null);
            }

            @Override
            public void onSegmentResults(@NonNull Bundle results) {
                if (session != mine) return;
                String best = best(results);
                Log.d(TAG, "tramo: " + best);
                if (best == null || best.isEmpty()) return;
                receive(best, true);
                JSObject data = new JSObject();
                data.put("text", text);
                notifyListeners("partial", data);
            }

            @Override
            public void onEndOfSegmentedSession() {
                if (session != mine) return;
                Log.d(TAG, "fin de la sesión en tramos");
                finish(null);
            }

            @Override
            public void onError(int error) {
                if (session != mine) return;
                Log.i(TAG, "error " + error);
                // Silencio o nada entendido en una pausa: se sigue escuchando
                boolean pause = error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
                    || error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY;
                if (pause) continueOrFinish(mine, null);
                else finish(messageFor(error));
            }

            @Override
            public void onReadyForSpeech(Bundle params) {
                if (session != mine) return;
                Log.d(TAG, "listo para escuchar");
                resolveStart();
            }

            @Override
            public void onBeginningOfSpeech() {
                Log.d(TAG, "empezó a hablar");
            }

            @Override
            public void onRmsChanged(float rmsdB) {}

            @Override
            public void onBufferReceived(byte[] buffer) {}

            @Override
            public void onEndOfSpeech() {
                Log.d(TAG, "dejó de hablar");
            }

            @Override
            public void onEvent(int eventType, Bundle params) {}
        };
    }

    /** Entrega el texto, ya sea porque la persona soltó el botón o porque Android terminó solo. */
    private void finish(String error) {
        if (!running) return;
        running = false;
        active = false;
        resolveStart();
        Log.i(TAG, "entendido \"" + text + "\"" + (error != null ? " · " + error : ""));
        JSObject result = textResult();
        if (error != null) result.put("error", error);
        if (stopCall != null) {
            PluginCall call = stopCall;
            stopCall = null;
            call.resolve(result);
        } else {
            notifyListeners("end", result);
        }
        main.post(this::destroyRecognizer);
    }

    private void destroyRecognizer() {
        if (recognizer != null && !running) {
            recognizer.destroy();
            recognizer = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        running = false;
        destroyRecognizer();
    }

    private JSObject textResult() {
        JSObject result = new JSObject();
        result.put("text", text);
        return result;
    }

    private static Intent intentFor(String locale) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale);
        return intent;
    }

    private static String best(Bundle bundle) {
        ArrayList<String> list = bundle == null ? null : bundle.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return list == null || list.isEmpty() ? null : list.get(0);
    }

    /** El primer español de la lista, en el orden de LOCALES; si no, cualquier español. */
    private static String spanish(List<String> languages) {
        if (languages == null) return null;
        for (String wanted : LOCALES) {
            for (String l : languages) if (l.equalsIgnoreCase(wanted)) return l;
        }
        for (String l : languages) if (l.toLowerCase().startsWith("es")) return l;
        return null;
    }

    private String permissionName() {
        PermissionState state = getPermissionState("microphone");
        if (state == PermissionState.GRANTED) return "granted";
        if (state == PermissionState.DENIED) return "denied";
        return "prompt";
    }

    private static String messageFor(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_NO_MATCH:
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return null;
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
            case SpeechRecognizer.ERROR_SERVER:
                return "Sin conexión este teléfono no puede dictar. Bajá el español para dictado sin conexión en los ajustes de voz de Google, o escribilo en Texto.";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "Rumbo necesita el micrófono para dictar.";
            case 12: // ERROR_LANGUAGE_NOT_SUPPORTED
            case 13: // ERROR_LANGUAGE_UNAVAILABLE
                return "El español para dictar todavía no está descargado en este teléfono.";
            default:
                return "No se pudo dictar (" + error + ").";
        }
    }
}
