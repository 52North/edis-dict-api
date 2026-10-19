import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import * as xlsx from 'xlsx';

interface ListEntry {
  Suchwortkategorie?: string;
  Suchworte?: string;
  Übersetzungen?: string;
  Synonyme?: string;
}

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

  getAlternativeEinzugsgebiete(einzugsgebiet?: string): string[] | undefined {
    if (!einzugsgebiet) return;
    const match = this.searchTermList.find((e) => {
      if (e.Suchwortkategorie === 'Einzugsgebiete') {
        return (
          e.Suchworte?.toLocaleLowerCase().indexOf(
            einzugsgebiet.toLocaleLowerCase(),
          ) >= 0
        );
      }
    });
    return this.handleMatch(match);
  }

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

  private removeKreisWords(kreis: string): string {
    return kreis
      .replaceAll('Landkreis', '')
      .replaceAll('landkreis', '')
      .replaceAll('Kreis', '')
      .replaceAll('kreis', '')
      .trim();
  }

  private handleMatch(match: ListEntry) {
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
