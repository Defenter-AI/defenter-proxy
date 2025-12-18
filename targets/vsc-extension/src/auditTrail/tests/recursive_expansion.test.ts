import { isExpandableValue, truncateJson } from "../utils";

describe("isExpandableValue", () => {
    it("returns true for plain objects", () => {
        expect(isExpandableValue({ a: 1, b: 2 })).toBe(true);
    });

    it("returns true for arrays", () => {
        expect(isExpandableValue([1, 2, 3])).toBe(true);
    });

    it("returns false for null", () => {
        expect(isExpandableValue(null)).toBe(false);
    });

    it("returns false for undefined", () => {
        expect(isExpandableValue(undefined)).toBe(false);
    });

    it("returns false for strings", () => {
        expect(isExpandableValue("test")).toBe(false);
    });

    it("returns false for numbers", () => {
        expect(isExpandableValue(42)).toBe(false);
    });
});

describe("truncateJson", () => {
    it("returns short objects unchanged", () => {
        const shortObj = { a: 1, b: 2 };
        const result = truncateJson(shortObj, 80);
        expect(result).toBe(JSON.stringify(shortObj));
    });

    it("truncates long objects", () => {
        const longObj = {
            app_uid: "4636d131-c75c-4025-9f0a-f001ad1d3634",
            created_at: "2025-10-09T14:55:29.410885",
            id: 11,
            message: "Initialization data stored successfully",
        };
        const result = truncateJson(longObj, 50);
        expect(result.length).toBeLessThanOrEqual(53); // 50 + "..."
        expect(result.endsWith("...")).toBe(true);
    });
});

describe("nested field expansion", () => {
    it("correctly identifies expandable fields in nested structure", () => {
        const testData = {
            result: { id: 1, name: "test" },
            items: ["first", "second"],
            count: 42,
        };

        expect(isExpandableValue(testData.result)).toBe(true);
        expect(isExpandableValue(testData.items)).toBe(true);
        expect(isExpandableValue(testData.count)).toBe(false);
    });

    it("correctly identifies expandable elements in arrays", () => {
        const items = ["string", 42, { nested: true }, ["nested", "array"]];

        expect(isExpandableValue(items[0])).toBe(false); // string
        expect(isExpandableValue(items[1])).toBe(false); // number
        expect(isExpandableValue(items[2])).toBe(true); // object
        expect(isExpandableValue(items[3])).toBe(true); // array
    });
});
