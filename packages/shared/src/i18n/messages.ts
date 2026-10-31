// UI strings for all three surfaces. English is the reference catalogue; the German one is typed
// against it, so a missing or misspelled key fails the typecheck. Placeholders use {name}.
export const en = {
  'common.yes': 'yes',
  'common.no': 'no',
  'language.label': 'Language',
  'language.de': 'Deutsch',
  'language.en': 'English',

  'foundation.badge': 'Foundation shell',
  'foundation.notice':
    'This build has no payment screens yet. Paying, refunds and reports come in the next stages.',
  'foundation.tokens': 'Shared design tokens',
  'foundation.formatting': 'Shared formatting',
  'foundation.sampleAmount': 'Sample amount, not a real price',
  'foundation.berlinTime': "Now in Europe/Berlin (this device's clock)",
  'foundation.reportDay': 'Report day in Europe/Berlin',

  'connection.title': 'API connection check',
  'connection.description':
    'Reads the public remote configuration (GET /config). No login and no payment.',
  'connection.run': 'Check connection',
  'connection.running': 'Checking…',
  'connection.success': 'Reachable: HTTP {status} in {duration} ms',
  'connection.problem':
    'Server answered with error {code} (HTTP {status}). Retryable: {retryable}.',
  'connection.invalid': 'Unexpected response (HTTP {status}).',
  'connection.timeout': 'No response within the time limit.',
  'connection.network': 'No response: network error, or the browser blocked the request (CORS).',
  'connection.paymentsEnabled': 'Payments switched on by the server: {value}',
  'connection.minAppVersion': 'Minimum app version: {value}',
  'connection.serverTime': 'Server time (Date header): {value}',
  'connection.serverTimeUnavailable':
    'Server time unreadable: Date header missing or not exposed to the browser (CORS).',
  'connection.configMissing': 'API configuration incomplete. Missing: {names}',

  'payments.title': 'Payments',
  'payments.checking': 'Checking whether payments are available…',
  'payments.open': 'Payments are available.',
  'payments.paused': 'Payments are paused by the server. Earlier payments can still be checked.',
  'payments.updateRequired':
    'This app version ({current}) is older than the required {minimum}. Please update the app; new payments are blocked until then.',
  'payments.updateRequiredUnknown':
    'This app version ({current}) is no longer accepted. Please update the app; new payments are blocked until then.',
  'payments.configUnavailable':
    'Payment availability could not be checked. New payments stay blocked until it can be.',
  'payments.invalidVersion': 'The app or server version is invalid, so new payments are blocked.',
  'payments.notConfigured': 'The API is not configured, so payments are unavailable.',

  'storage.title': 'Secure storage check',
  'storage.description':
    "Saves, reads and deletes a test record in this device's secure storage, where unfinished payments are kept.",
  'storage.run': 'Check secure storage',
  'storage.running': 'Checking…',
  'storage.ok': 'Secure storage works: {bytes} bytes saved, read back and deleted.',
  'storage.failed': 'Secure storage failed while trying to {step} the test record.',
  'storage.step.save': 'save',
  'storage.step.load': 'read back',
  'storage.step.remove': 'delete',

  'student.title': 'Mensa Pay',
  'student.next':
    'Next stage: scan a till QR, confirm with biometrics or PIN, and see your payment history.',
  'student.nav.home': 'Start',
  'student.nav.connection': 'Connection check',
  'student.openConnection': 'Open connection check',

  'till.title': 'Mensa Till',
  'till.next': 'Next stage: ring up an order, show its QR, follow the payment and refund it.',

  'dashboard.title': 'Studierendenwerk dashboard',
  'dashboard.next':
    'Next stage: daily totals per mensa and till, payments that need attention, search with full history and CSV export.',
};

export type MessageKey = keyof typeof en;

export const de: Record<MessageKey, string> = {
  'common.yes': 'ja',
  'common.no': 'nein',
  'language.label': 'Sprache',
  'language.de': 'Deutsch',
  'language.en': 'English',

  'foundation.badge': 'Grundgerüst',
  'foundation.notice':
    'Dieser Build hat noch keine Zahlungsbildschirme. Bezahlen, Erstattungen und Berichte folgen in den nächsten Stufen.',
  'foundation.tokens': 'Gemeinsame Design-Tokens',
  'foundation.formatting': 'Gemeinsame Formatierung',
  'foundation.sampleAmount': 'Beispielbetrag, kein echter Preis',
  'foundation.berlinTime': 'Jetzt in Europe/Berlin (Uhr dieses Geräts)',
  'foundation.reportDay': 'Berichtstag in Europe/Berlin',

  'connection.title': 'API-Verbindungstest',
  'connection.description':
    'Liest die öffentliche Remote-Konfiguration (GET /config). Ohne Anmeldung und ohne Zahlung.',
  'connection.run': 'Verbindung prüfen',
  'connection.running': 'Wird geprüft …',
  'connection.success': 'Erreichbar: HTTP {status} in {duration} ms',
  'connection.problem':
    'Der Server antwortete mit Fehler {code} (HTTP {status}). Wiederholbar: {retryable}.',
  'connection.invalid': 'Unerwartete Antwort (HTTP {status}).',
  'connection.timeout': 'Keine Antwort innerhalb des Zeitlimits.',
  'connection.network':
    'Keine Antwort: Netzwerkfehler, oder der Browser hat die Anfrage blockiert (CORS).',
  'connection.paymentsEnabled': 'Zahlungen serverseitig eingeschaltet: {value}',
  'connection.minAppVersion': 'Mindestversion der App: {value}',
  'connection.serverTime': 'Serverzeit (Date-Header): {value}',
  'connection.serverTimeUnavailable':
    'Serverzeit nicht lesbar: Date-Header fehlt oder ist für den Browser nicht freigegeben (CORS).',
  'connection.configMissing': 'API-Konfiguration unvollständig. Es fehlt: {names}',

  'payments.title': 'Zahlungen',
  'payments.checking': 'Es wird geprüft, ob Zahlungen verfügbar sind …',
  'payments.open': 'Zahlungen sind verfügbar.',
  'payments.paused':
    'Zahlungen sind serverseitig pausiert. Frühere Zahlungen können weiterhin geprüft werden.',
  'payments.updateRequired':
    'Diese App-Version ({current}) ist älter als die erforderliche Version {minimum}. Bitte aktualisiere die App; neue Zahlungen sind bis dahin gesperrt.',
  'payments.updateRequiredUnknown':
    'Diese App-Version ({current}) wird nicht mehr akzeptiert. Bitte aktualisiere die App; neue Zahlungen sind bis dahin gesperrt.',
  'payments.configUnavailable':
    'Die Zahlungsverfügbarkeit konnte nicht geprüft werden. Neue Zahlungen bleiben bis dahin gesperrt.',
  'payments.invalidVersion':
    'Die App- oder Serverversion ist ungültig, daher sind neue Zahlungen gesperrt.',
  'payments.notConfigured': 'Die API ist nicht konfiguriert, daher sind Zahlungen nicht möglich.',

  'storage.title': 'Prüfung des sicheren Speichers',
  'storage.description':
    'Speichert, liest und löscht einen Testeintrag im sicheren Speicher dieses Geräts, in dem unabgeschlossene Zahlungen gesichert werden.',
  'storage.run': 'Sicheren Speicher prüfen',
  'storage.running': 'Wird geprüft …',
  'storage.ok': 'Sicherer Speicher funktioniert: {bytes} Bytes gespeichert, gelesen und gelöscht.',
  'storage.failed': 'Sicherer Speicher fehlgeschlagen beim {step} des Testeintrags.',
  'storage.step.save': 'Speichern',
  'storage.step.load': 'Zurücklesen',
  'storage.step.remove': 'Löschen',

  'student.title': 'Mensa Pay',
  'student.next':
    'Nächste Stufe: QR-Code an der Kasse scannen, mit Biometrie oder PIN bestätigen und den Zahlungsverlauf ansehen.',
  'student.nav.home': 'Start',
  'student.nav.connection': 'Verbindungstest',
  'student.openConnection': 'Verbindungstest öffnen',

  'till.title': 'Mensa Kasse',
  'till.next':
    'Nächste Stufe: Bestellung erfassen, QR-Code anzeigen, Zahlung verfolgen und erstatten.',

  'dashboard.title': 'Studierendenwerk-Dashboard',
  'dashboard.next':
    'Nächste Stufe: Tagessummen pro Mensa und Kasse, Zahlungen mit Handlungsbedarf, Suche mit vollständigem Verlauf und CSV-Export.',
};
