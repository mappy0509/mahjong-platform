import { describe, it, expect } from "vitest";
import {
  tileKind,
  tileCopy,
  makeTileId,
  tileSuit,
  tileNumber,
  isNumberTile,
  isHonorTile,
  isTerminal,
  isTerminalOrHonor,
  isSimple,
  isGreenTile,
  isRedDora,
  doraFromIndicator,
  tileKindToString,
  sortTileIds,
  countByKind,
} from "../tile";
import { TileSuit } from "@mahjong/shared";
import {
  MAN_START,
  PIN_START,
  SOU_START,
  EAST_WIND,
  HAKU,
  HATSU,
  CHUN,
  RED_MAN_5,
  RED_PIN_5,
  RED_SOU_5,
} from "@mahjong/shared";

describe("Tile System", () => {
  describe("tileKind / tileCopy", () => {
    it("should convert TileId to TileKind", () => {
      expect(tileKind(0)).toBe(0); // 1m copy 0
      expect(tileKind(3)).toBe(0); // 1m copy 3
      expect(tileKind(4)).toBe(1); // 2m copy 0
      expect(tileKind(135)).toBe(33); // 中 copy 3
    });

    it("should get copy index", () => {
      expect(tileCopy(0)).toBe(0);
      expect(tileCopy(1)).toBe(1);
      expect(tileCopy(2)).toBe(2);
      expect(tileCopy(3)).toBe(3);
      expect(tileCopy(4)).toBe(0);
    });

    it("should create TileId from kind and copy", () => {
      expect(makeTileId(0, 0)).toBe(0);
      expect(makeTileId(0, 3)).toBe(3);
      expect(makeTileId(1, 0)).toBe(4);
      expect(makeTileId(33, 3)).toBe(135);
    });
  });

  describe("tileSuit", () => {
    it("should identify man tiles", () => {
      for (let k = 0; k < 9; k++) {
        expect(tileSuit(k)).toBe(TileSuit.MAN);
      }
    });

    it("should identify pin tiles", () => {
      for (let k = 9; k < 18; k++) {
        expect(tileSuit(k)).toBe(TileSuit.PIN);
      }
    });

    it("should identify sou tiles", () => {
      for (let k = 18; k < 27; k++) {
        expect(tileSuit(k)).toBe(TileSuit.SOU);
      }
    });

    it("should identify wind tiles", () => {
      for (let k = 27; k < 31; k++) {
        expect(tileSuit(k)).toBe(TileSuit.WIND);
      }
    });

    it("should identify dragon tiles", () => {
      for (let k = 31; k < 34; k++) {
        expect(tileSuit(k)).toBe(TileSuit.DRAGON);
      }
    });
  });

  describe("tile properties", () => {
    it("should identify terminal tiles", () => {
      expect(isTerminal(0)).toBe(true); // 1m
      expect(isTerminal(8)).toBe(true); // 9m
      expect(isTerminal(4)).toBe(false); // 5m
      expect(isTerminal(27)).toBe(false); // 東 (honor, not terminal)
    });

    it("should identify simple tiles", () => {
      expect(isSimple(1)).toBe(true); // 2m
      expect(isSimple(7)).toBe(true); // 8m
      expect(isSimple(0)).toBe(false); // 1m
      expect(isSimple(8)).toBe(false); // 9m
      expect(isSimple(27)).toBe(false); // 東
    });

    it("should identify green tiles", () => {
      // 2s=19, 3s=20, 4s=21, 6s=23, 8s=25, 発=32
      expect(isGreenTile(19)).toBe(true); // 2s
      expect(isGreenTile(20)).toBe(true); // 3s
      expect(isGreenTile(21)).toBe(true); // 4s
      expect(isGreenTile(23)).toBe(true); // 6s
      expect(isGreenTile(25)).toBe(true); // 8s
      expect(isGreenTile(32)).toBe(true); // 発
      expect(isGreenTile(22)).toBe(false); // 5s
      expect(isGreenTile(0)).toBe(false); // 1m
    });
  });

  describe("red dora", () => {
    it("should identify red dora tiles", () => {
      expect(isRedDora(RED_MAN_5)).toBe(true);
      expect(isRedDora(RED_PIN_5)).toBe(true);
      expect(isRedDora(RED_SOU_5)).toBe(true);
      expect(isRedDora(0)).toBe(false);
      expect(isRedDora(RED_MAN_5 + 1)).toBe(false);
    });
  });

  describe("dora indicator", () => {
    it("should calculate dora from number tile indicator", () => {
      expect(doraFromIndicator(0)).toBe(1); // 1m -> 2m
      expect(doraFromIndicator(7)).toBe(8); // 8m -> 9m
      expect(doraFromIndicator(8)).toBe(0); // 9m -> 1m (wraps)
      expect(doraFromIndicator(9)).toBe(10); // 1p -> 2p
    });

    it("should calculate dora from wind indicator", () => {
      expect(doraFromIndicator(27)).toBe(28); // 東 -> 南
      expect(doraFromIndicator(28)).toBe(29); // 南 -> 西
      expect(doraFromIndicator(30)).toBe(27); // 北 -> 東 (wraps)
    });

    it("should calculate dora from dragon indicator", () => {
      expect(doraFromIndicator(31)).toBe(32); // 白 -> 發
      expect(doraFromIndicator(32)).toBe(33); // 發 -> 中
      expect(doraFromIndicator(33)).toBe(31); // 中 -> 白 (wraps)
    });
  });

  describe("tileKindToString", () => {
    it("should format number tiles", () => {
      expect(tileKindToString(0)).toBe("1m");
      expect(tileKindToString(4)).toBe("5m");
      expect(tileKindToString(9)).toBe("1p");
      expect(tileKindToString(18)).toBe("1s");
    });

    it("should format honor tiles", () => {
      expect(tileKindToString(27)).toBe("東");
      expect(tileKindToString(31)).toBe("白");
      expect(tileKindToString(33)).toBe("中");
    });
  });
});
