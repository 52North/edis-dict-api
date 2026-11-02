# EDIS Dict-API

- stellt die Pegelonline Stationen in aufbereiteter Form zur Verfügung
- macht die Stationen mit verschiedenen Parametern durchsuchbar
- komprimiert Antworten ab 1 KB mit Brotli oder gzip, wenn der Client das per `Accept-Encoding` anbietet (Browser tun das von selbst)

## Swagger-UI

Aufruf der Swagger-UI zur Dict API
> http://localhost:3000/api

## Suchparameter

Suche auf der Liste der Pegelonline Stationen. Bei Angabe mehrerer Parameter werden diese durch eine UND-Verknüpfung kombiniert. Jeder Parameter darf nur einmal angegeben werden, ungültige Angaben beantwortet die API mit HTTP 400. Unbekannte Parameter werden ignoriert.

Die Textparameter vergleichen ohne Groß- und Kleinschreibung und finden auch Teile eines Namens, mit `match=exact` nur ganze Namen (siehe [match](#match)).

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

### match

Legt fest, wie `station`, `gewaesser`, `agency`, `land`, `country`, `einzugsgebiet` und `kreis` vergleichen. Mit `contains` (Standard) finden sie auch Teile eines Namens, `land=Sachsen` also auch Niedersachsen und Sachsen-Anhalt. Mit `exact` trifft nur der ganze Name oder eine ganze alternative Benennung, weiterhin ohne Groß- und Kleinschreibung. `q`, `number`, `parameter` und `bbox` bleiben unverändert. Andere Werte als `contains` und `exact` beantwortet die API mit HTTP 400.
> http://localhost:3000/search?land=Sachsen&match=exact

Auch Alternativen treffen nur ganz:
> http://localhost:3000/search?land=Saxony&match=exact

Ein Wert aus `/options` (siehe [Werte der Suchparameter](#werte-der-suchparameter)) findet mit `match=exact` genau die Stationen mit diesem Wert.

### sort

Ohne `sort` kommen die Treffer in der Reihenfolge von Pegelonline. Mit `sort=relevance` stehen die Treffer von `q` vorn, die am besten passen, jeweils ohne Groß- und Kleinschreibung:

1. `q` ist genau der Name, die Pegelnummer oder die UUID der Station
2. genau das Gewässer oder eine alternative Benennung davon
3. genau die Stadt oder der Kreis, auch als Alternative
4. genau ein anderes Feld: Bundesland, Land, Einzugsgebiet, Agency oder eine Messgröße (wie bei `parameter`)
5. der Name beginnt mit `q`
6. der Name enthält `q`
7. das Gewässer enthält `q`
8. die Stadt oder der Kreis enthält `q`
9. alle übrigen Treffer

Innerhalb einer Stufe bleibt die Reihenfolge von Pegelonline. Die Treffermenge ändert sich nicht. Ohne `q` hat `sort` keine Wirkung. Andere Werte als `relevance` beantwortet die API mit HTTP 400.
> http://localhost:3000/search?q=sachsen&sort=relevance

liefert zuerst die Pegel in Sachsen, dann SACHSENHAUSEN und erst danach die Pegel in Niedersachsen und Sachsen-Anhalt. Ohne `sort` stehen die Pegel in Niedersachsen vorn.

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

## Sprachen

Land, Bundesland, Kreis und Ort kommen auf Deutsch aus Nominatim. Ihre Namen in den weiteren Sprachen des Harvests (`ADDITIONAL_HARVEST_LANGUAGE_LIST`, z. B. `en`, `fr`, `nl`, `de-CH`) stehen je Sprache in `country_names`, `land_names`, `kreis_names` und `city_names`, aber nur, wenn sie vom deutschen Namen abweichen. Umschreibungen wie „Koeln“ und Kürzel haben keine Sprache und stehen nur in den `*_alternatives`, die weiterhin alle Benennungen enthalten.

```json
{
  "city": "Köln",
  "city_alternatives": ["Koeln", "Cologne", "Kolonia", "Kolín nad Rýnem", "Keulen"],
  "city_names": { "en": "Cologne", "pl": "Kolonia", "cs": "Kolín nad Rýnem", "fr": "Cologne", "nl": "Keulen" },
  …
}
```

Gewässer und Einzugsgebiete haben noch keine Namen je Sprache.

## Download über die Sensor Web API

Jede Zeitreihe, zu der die Sensor Web API (gdi-sos) ein Dataset hat, enthält einen `sensorweblink` zum Download ihrer Messwerte als CSV. Ohne weitere Angabe liefert er die letzte Woche, mit `timespan` als ISO-8601-Zeitraum den angegebenen:

```json
{
  "shortname": "W",
  "pegelonlinelink": "https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations/8ba772ed-e45b-4be8-b91d-0c6c92de59e4/W/measurements.json",
  "sensorweblink": "https://test.sensor-gdi.de/webservices/gis/gdi-sos/api/datasets/2629/data.csv",
  …
}
```

> https://test.sensor-gdi.de/webservices/gis/gdi-sos/api/datasets/2629/data.csv?timespan=PT24H/now

> https://test.sensor-gdi.de/webservices/gis/gdi-sos/api/datasets/2629/data.csv?timespan=2026-11-01T00:00:00Z/2026-11-02T00:00:00Z

Der Link fehlt bei Zeitreihen ohne Dataset in der Sensor Web API, vor allem bei Pegeln ohne Koordinaten, und ganz, wenn die Dict-API ohne Sensor Web API betrieben wird.
