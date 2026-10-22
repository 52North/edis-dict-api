# EDIS Dict-API

- stellt die Pegelonline Stationen in aufbereiteter Form zur Verfügung
- macht die Stationen mit verschiedenen Parametern durchsuchbar

## Swagger-UI

Aufruf der Swagger-UI zur Dict API
> http://localhost:3000/api

## Suchparameter

Suche auf der Liste der Pegelonline Stationen. Bei Angabe mehrerer Parameter werden diese durch eine UND-Verknüpfung kombiniert. Jeder Parameter darf nur einmal angegeben werden, ungültige Angaben beantwortet die API mit HTTP 400. Unbekannte Parameter werden ignoriert.

Für einige Stationen liefert Pegelonline keine Koordinaten. Sie haben dann weder `latitude`/`longitude` noch Adresse und Einzugsgebiet, deshalb finden `land`, `kreis`, `country`, `einzugsgebiet` und `bbox` sie nicht.

### station

Suche per String matching nach Stationen mit dem angegebenen Namen
> http://localhost:3000/search?station=köln

### number

Suche nach der Station mit der angegebenen Pegelnummer, nur die ganze Nummer trifft
> http://localhost:3000/search?number=2710080

### gewaesser

Suche per String matching nach Stationen an dem angegebenen Gewässer
> http://localhost:3000/search?gewaesser=rhein

### agency

Suche per String matching nach Stationen mit der angegebenen Agency
> http://localhost:3000/search?agency=dresden

### land

Suche per String matching nach Stationen im angegebenen Bundesland
> http://localhost:3000/search?land=hamburg

### country

Suche per String matching nach Stationen im angegebenen Nationalstaat
> http://localhost:3000/search?country=deutschland

### einzugsgebiet

Suche per String matching nach Stationen im angegebenen Einzugsgebiet
> http://localhost:3000/search?einzugsgebiet=ems

### kreis

Suche per String matching nach Stationen im angegebenen Landkreis
> http://localhost:3000/search?kreis=emsland

### parameter

Suche nach Stationen mit dem angegebenen Messparameter, über das Kürzel (z.B. `WT`) oder den ganzen Namen ohne den Zusatz „Rohdaten“ (z.B. `Wassertemperatur`). Groß- und Kleinschreibung spielen keine Rolle, Teile eines Namens treffen nicht.
> http://localhost:3000/search?parameter=wassertemperatur

Die Wasserstandsvorhersage hat das Kürzel `WV` (`Wasserstandvorhersage`) und kommt vor allem an Elbe, Oder und Rhein vor. Die aktuelle Vorhersage liefert der `pegelonlinelink` der Zeitreihe, ein `mqtttopic` gibt es dafür nicht.
> http://localhost:3000/search?parameter=WV

### bbox

Suche per String matching nach Stationen in der durch Koordinaten angegebenen Bounding Box (`minLon, minLat, maxLon, maxLat`). Erlaubt sind Längengrade von -180 bis 180 und Breitengrade von -90 bis 90, das Minimum darf nicht größer als das Maximum sein.
> http://localhost:3000/search?bbox=7,52,8,53

### q

Allgemeiner Suchparameter, durch den alle vorhergehenden Parameter per String matching durchsucht werden
> http://localhost:3000/search?q=köln

## Werte der Suchparameter

Liefert die sortierten Werte eines Suchparameters über alle Stationen, z. B. für Auswahllisten oder eine Autovervollständigung. Möglich sind `station`, `number`, `gewaesser`, `agency`, `land`, `country`, `einzugsgebiet`, `kreis` und `parameter`. Fehlt `parameter` oder ist er nicht dabei, antwortet die API mit HTTP 400.
> http://localhost:3000/options?parameter=land

Die Liste enthält auch die alternativen Benennungen, die die Suche ebenfalls findet, z. B. `Bavaria` neben `Bayern`.

### grouped

Mit `grouped=true` kommt je Wert ein Objekt mit seinen alternativen Benennungen. So lassen sich nur die Werte anzeigen, während die Eingabe auch die Alternativen findet. Bei `parameter` ist der Wert der Name der Messgröße ohne „Rohdaten“, die Alternative ihr Kürzel. Andere Werte als `true` und `false` beantwortet die API mit HTTP 400.
> http://localhost:3000/options?parameter=land&grouped=true

```json
[
  { "value": "Baden-Württemberg", "alternatives": ["Bade-Wurtemberg", "Baden-Wuerttemberg", "Badenia-Wirtembergia"] },
  { "value": "Basel-Stadt", "alternatives": ["Basel-City", "Bazel-Stad", "Bâle-Ville"] },
  { "value": "Bayern", "alternatives": ["Bavaria", "Bavière", "Bawaria", "Beieren"] },
  …
]
```
