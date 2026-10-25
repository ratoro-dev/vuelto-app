import Foundation

/// Lo que comparten la app, los widgets, los controles y los atajos de Siri a través del App Group.
/// La app escribe el resumen (`RumboSnapshot`) cada vez que cambian los gastos; los demás solo lo leen.
enum RumboShared {
    static let appGroup = "group.uy.rumbo.app"
    private static let snapshotKey = "rumbo.widget.snapshot"
    private static let inboxKey = "rumbo.siri.inbox"

    static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

    /// Si la firma incluye el App Group (sin él, los widgets no ven lo que escribe la app).
    static var hasAppGroup: Bool {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) != nil
    }

    static func loadSnapshot() -> RumboSnapshot? {
        guard let json = defaults?.string(forKey: snapshotKey), let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(RumboSnapshot.self, from: data)
    }

    static func saveSnapshot(json: String) {
        defaults?.set(json, forKey: snapshotKey)
    }

    /// Un gasto anotado con Siri o dictado en el reloj sin abrir la app. La app lo guarda al abrirse.
    struct InboxItem: Codable {
        let phrase: String
        /// Instante ISO en que se dijo.
        let at: String
        /// La categoría elegida a mano en el reloj ("Cambiar categoría"), si la hay.
        var category: String?
    }

    static func appendInbox(_ phrase: String, at: String? = nil, category: String? = nil) {
        var items = inbox()
        items.append(InboxItem(phrase: phrase, at: at ?? ISO8601DateFormatter().string(from: Date()), category: category))
        if let data = try? JSONEncoder().encode(items) { defaults?.set(data, forKey: inboxKey) }
    }

    static func takeInbox() -> [InboxItem] {
        let items = inbox()
        defaults?.removeObject(forKey: inboxKey)
        return items
    }

    static func inboxCount() -> Int { inbox().count }

    private static func inbox() -> [InboxItem] {
        guard let data = defaults?.data(forKey: inboxKey) else { return [] }
        return (try? JSONDecoder().decode([InboxItem].self, from: data)) ?? []
    }

    /// "$ 4.860" → "4.860 pesos", para que Siri no lo lea como dólares.
    static func spoken(_ money: String) -> String {
        let negative = money.contains("−")
        let digits = money.replacingOccurrences(of: "−", with: "").replacingOccurrences(of: "$", with: "").trimmingCharacters(in: .whitespaces)
        return "\(negative ? "menos " : "")\(digits) pesos"
    }
}

/// El resumen que arma la app (src/domain/widgets.ts → WidgetSnapshot), con los textos ya formateados.
struct RumboSnapshot: Codable {
    struct Item: Codable {
        let name: String
        let amountText: String
    }

    struct Bill: Codable {
        let name: String
        let amountText: String
        /// "Vie 9 · mañana"
        let dueText: String
        /// "Tarjeta vence el viernes" (falta en resúmenes viejos).
        var shortText: String?
        let soon: Bool
    }

    let month: String
    let available: Double
    let availableText: String
    let spentText: String
    let budgetText: String
    let usedShare: Double
    /// "72% de octubre usado" (falta en resúmenes viejos).
    var usedText: String?
    let over: Bool
    let todayText: String
    let today: [Item]
    let pendingCount: Int
    let nextBill: Bill?
    let updatedAt: String

    /// Lo que se ve en la galería de widgets y antes de abrir la app por primera vez.
    static let placeholder = RumboSnapshot(
        month: "octubre", available: 12450, availableText: "$ 12.450", spentText: "$ 32.550", budgetText: "$ 45.000",
        usedShare: 0.72, usedText: "72% de octubre usado", over: false, todayText: "$ 1.844",
        today: [Item(name: "Feria", amountText: "$ 450"), Item(name: "Almacén", amountText: "$ 1.342"), Item(name: "Ómnibus", amountText: "$ 52")],
        pendingCount: 2,
        nextBill: Bill(name: "Tarjeta de crédito", amountText: "$ 4.860", dueText: "Vie 9 · en 3 días", shortText: "Tarjeta vence el viernes", soon: false),
        updatedAt: ""
    )
}
