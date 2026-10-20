import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import * as xlsx from 'xlsx';

/** A row of the search term list, Übersetzungen and Synonyme are comma separated. */
interface ListEntry {
  Suchwortkategorie?: string;
  Suchworte?: string;
  Übersetzungen?: string;
  Synonyme?: string;
}

/**
 * Synonyms and translations from the search term list (SUCHWORTLISTE_FILE_PATH,
 * sheet Tabelle1), read once at start. Only the categories "Gewässer / Flüsse",
 * "Einzugsgebiete" and "Landkreis" are used.
 */
@Injectable()
export class SearchTermListService {
  private searchTermList: ListEntry[];

  constructor(private readonly configService: ConfigService) {
    const suchwortlisteFilePath = this.configService.get<string>(
      'SUCHWORTLISTE_FILE_PATH',
      'suchwortliste.xlsx',
    );
    const res = xlsx.readFile(suchwortlisteFilePath);
    const sheet = res.Sheets['Tabelle1'];
    this.searchTermList = xlsx.utils.sheet_to_json(sheet);
  }

  /** Synonyms, then translations of the water, undefined if the list has none. */
  getAlternativeGewaesser(gewaesser: string): string[] | undefined {
    const match = this.searchTermList.find((e) => {
      if (e.Suchwortkategorie === 'Gewässer / Flüsse') {
        // terms are single quoted names, a substring match would e.g. find "DORTMUND-EMS-KANAL" for "EMS"
        return (
          e.Suchworte?.replaceAll('"', '').trim().toLocaleLowerCase() ===
          gewaesser.toLocaleLowerCase()
        );
      }
    });
    return this.handleMatch(match);
  }

  /**
   * Synonyms, then translations of the first list entry containing the name of
   * the drainage area, undefined if there is none.
   */
  getAlternativeEinzugsgebiete(einzugsgebiet?: string): string[] | undefined {
    if (!einzugsgebiet) return;
    const match = this.searchTermList.find((e) => {
      if (e.Suchwortkategorie === 'Einzugsgebiete') {
        return (
          !!e.Suchworte &&
          e.Suchworte.toLocaleLowerCase().includes(
            einzugsgebiet.toLocaleLowerCase(),
          )
        );
      }
    });
    return this.handleMatch(match);
  }

  /**
   * Synonyms, then translations of the kreis, compared without words like
   * "Landkreis", undefined if the list has none.
   */
  getAlternativeKreise(kreis?: string): string[] | undefined {
    if (!kreis) return;
    const name = this.removeKreisWords(kreis).toLocaleLowerCase();
    const match = this.searchTermList.find((e) => {
      if (e.Suchwortkategorie === 'Landkreis') {
        // whole names, a substring match would e.g. find "Mayen-Koblenz" for the city "Koblenz"
        return (
          !!e.Suchworte &&
          this.removeKreisWords(e.Suchworte).toLocaleLowerCase() === name
        );
      }
    });
    return this.handleMatch(match);
  }

  /** So that e.g. "Landkreis Emsland" from nominatim matches "Emsland" in the list. */
  private removeKreisWords(kreis: string): string {
    return kreis
      .replaceAll('Landkreis', '')
      .replaceAll('landkreis', '')
      .replaceAll('Kreis', '')
      .replaceAll('kreis', '')
      .trim();
  }

  private handleMatch(match: ListEntry | undefined): string[] | undefined {
    if (match) {
      const syn = this.getSynonyme(match);
      const trans = this.getTranslations(match);
      return syn.length || trans.length ? [...syn, ...trans] : undefined;
    }
  }

  private getTranslations(e: ListEntry) {
    const term = e.Übersetzungen;
    if (term) {
      return term.split(',').map((e) => e.trim());
    } else {
      return [];
    }
  }

  private getSynonyme(e: ListEntry): string[] {
    const term = e.Synonyme;
    if (term) {
      return term.split(',').map((e) => e.trim());
    } else {
      return [];
    }
  }
}
