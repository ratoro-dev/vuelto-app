import Foundation

/// Lectura rápida de lo dictado, solo para la pantalla "Confirmar" del reloj: monto total, categoría y medio de pago.
/// La lectura que vale es la del iPhone (src/domain/quickEntry.ts) cuando recibe la frase.
struct QuickParse {
    let total: Double
    /// Cuántos montos dijo ("168 de cebolla y 120 de tomate" son 2).
    let count: Int
    let category: String
    let payment: String?

    static let categories = ["Supermercado", "Delivery y salidas", "Transporte", "Servicios", "Salud", "Hogar", "Otros"]

    private static let keywords: [(String, [String])] = [
        ("Servicios", ["ute", "ose", "antel", "luz", "internet", "celular", "alquiler", "factura"]),
        ("Transporte", ["omnibus", "bondi", "stm", "boleto", "nafta", "ancap", "combustible", "uber", "taxi", "cabify", "peaje", "estacionamiento"]),
        ("Delivery y salidas", ["delivery", "pedidosya", "rappi", "almuerzo", "cena", "chivito", "pizza", "bar", "cafe", "cerveza", "restoran", "parrilla"]),
        ("Salud", ["farmacia", "remedio", "remedios", "mutualista", "medico"]),
        ("Hogar", ["ferreteria", "bazar"]),
        ("Supermercado", ["mercaderia", "mercaderias", "feria", "verduleria", "almacen", "super", "supermercado", "disco", "devoto", "tata", "carniceria", "panaderia", "pan", "leche", "yerba", "cebolla", "papa", "tomate", "palta", "fruta", "verdura", "agua", "refresco", "queso", "huevos", "carne", "pollo"]),
    ]
    private static let payments: [String: String] = ["efectivo": "Efectivo", "debito": "Débito", "credito": "Crédito", "tarjeta": "Crédito", "transferencia": "Transferencia"]
    private static let digitWords: [String: Int] = ["uno": 1, "un": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "nueve": 9]

    static func parse(_ text: String) -> QuickParse {
        let words = text
            .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "es"))
            .components(separatedBy: CharacterSet.whitespacesAndNewlines)
            .map { $0.trimmingCharacters(in: CharacterSet(charactersIn: ",;.!?¿¡\"“”")) }
            .filter { !$0.isEmpty }

        var amounts: [Double] = []
        var i = 0
        while i < words.count {
            let w = words[i].replacingOccurrences(of: "$", with: "")
            if let n = amount(w) {
                // "4 480": la cifra suelta es el comienzo del mismo número
                if let next = words[safe: i + 1].flatMap(amount), n < 10, String(Int(next)).hasPrefix(String(Int(n))), next >= 100 {
                    i += 1
                    continue
                }
                // "cuatro 80" / "4 80" → 480
                if n < 10, let next = words[safe: i + 1].flatMap(amount), next >= 10, next < 100 {
                    amounts.append(n * 100 + next)
                    i += 2
                    continue
                }
                amounts.append(n)
            } else if let d = digitWords[w], let next = words[safe: i + 1].flatMap(amount), next >= 10, next < 100 {
                amounts.append(Double(d * 100) + next)
                i += 2
                continue
            }
            i += 1
        }

        let category = keywords.first { _, keys in keys.contains { words.contains($0) } }?.0 ?? "Otros"
        let payment = words.lazy.compactMap { payments[$0] }.first
        return QuickParse(total: amounts.reduce(0, +), count: amounts.count, category: category, payment: payment)
    }

    /// "1.046,40", "1046.40", "1.200" o "450".
    private static func amount(_ raw: String) -> Double? {
        guard raw.first?.isNumber == true, raw.allSatisfy({ $0.isNumber || $0 == "." || $0 == "," }) else { return nil }
        var s = raw
        if s.contains(".") && s.contains(",") {
            s = s.replacingOccurrences(of: ".", with: "").replacingOccurrences(of: ",", with: ".")
        } else if let comma = s.lastIndex(of: ",") {
            s = s.distance(from: comma, to: s.endIndex) <= 3 ? s.replacingOccurrences(of: ",", with: ".") : s.replacingOccurrences(of: ",", with: "")
        } else if let dot = s.lastIndex(of: "."), s.distance(from: dot, to: s.endIndex) == 4 {
            s = s.replacingOccurrences(of: ".", with: "")
        }
        return Double(s)
    }

    /// "$ 1.046,40" o "$ 450", como en la app.
    static func pesos(_ n: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.groupingSeparator = "."
        f.decimalSeparator = ","
        f.minimumFractionDigits = n.rounded() == n ? 0 : 2
        f.maximumFractionDigits = 2
        return "$ \(f.string(from: NSNumber(value: n)) ?? "\(n)")"
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
