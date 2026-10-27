import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import TableWithPagination from "./TableWithPagination";
import TableWithPaginationAndRowSelection from "./TableWithPaginationAndRowSelection";
import TableWithPaginationAsync from "./TableWithPaginationAsync";
import { Column } from "./platformTable";

vi.mock("./DeleteMeasurementsIcon", () => ({ default: () => null }));
vi.mock("./SensorSelection", () => ({ default: () => null }));
vi.mock("./TimeRangeSelection", () => ({ TimeRangeSelection: () => null }));

interface ITopicRow {
    id: number;
    groupId: number;
    description: string;
    geoJsonData: string;
    edit: string;
}

const makeRows = (n: number): ITopicRow[] =>
    Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        groupId: (i % 3) + 1,
        description: `Topic ${String.fromCharCode(65 + (i % 26))}${i}`,
        geoJsonData: i === 7 ? "secret-geo" : "geo",
        edit: "",
    }));

// Columnas con el mismo estilo que las de TableColumns/ (formato react-table v7)
const makeColumns = (onEdit: (id: number) => void): Column<ITopicRow>[] => [
    { Header: "TopicId", accessor: "id", filter: "equals" },
    { Header: "GroupId", accessor: "groupId", filter: "equals" },
    { Header: "Description", accessor: "description" },
    { Header: "GeoJson", accessor: "geoJsonData", disableFilters: true },
    {
        Header: "",
        accessor: "edit",
        disableFilters: true,
        disableSortBy: true,
        Cell: (props: { row: { id: string }; rows: any[] }) => {
            const rowIndex = parseInt(props.row.id, 10);
            const row = props.rows.filter((row: { index: number }) => row.index === rowIndex)[0];
            const topicId = row?.cells[0]?.value;
            return <button onClick={() => onEdit(topicId)}>edit-{topicId}</button>;
        },
    },
];

const bodyRows = () => screen.getAllByRole("row").slice(1);
const firstColumnValues = () => bodyRows().map((r) => within(r).getAllByRole("cell")[0].textContent);

describe("TableWithPagination (TanStack v9 con columnas formato v7)", () => {
    it("pagina de 10 en 10, oculta columnas y navega", () => {
        render(<TableWithPagination dataTable={makeRows(25)} columnsTable={makeColumns(() => {})} componentName="" />);
        expect(bodyRows()).toHaveLength(10);
        expect(screen.getByText("1 of 3")).toBeInTheDocument();
        // geoJsonData está oculta por hiddenColumnCondition
        expect(screen.queryByText("GeoJson")).not.toBeInTheDocument();
        fireEvent.click(screen.getByText(">"));
        expect(screen.getByText("2 of 3")).toBeInTheDocument();
        expect(firstColumnValues()[0]).toBe("11");
        fireEvent.click(screen.getByText(">>"));
        expect(bodyRows()).toHaveLength(5);
    });

    it("el Cell recibe rows/row.id/cells[n].value como en v7", () => {
        const onEdit = vi.fn();
        render(<TableWithPagination dataTable={makeRows(5)} columnsTable={makeColumns(onEdit)} componentName="" />);
        fireEvent.click(screen.getByText("edit-3"));
        expect(onEdit).toHaveBeenCalledWith(3);
    });

    it("filtro 'equals' compara con == y el filtro por defecto es 'contiene' sin mayúsculas", () => {
        render(<TableWithPagination dataTable={makeRows(25)} columnsTable={makeColumns(() => {})} componentName="" />);
        const [idFilter, , descFilter] = screen.getAllByPlaceholderText("Search");
        fireEvent.change(idFilter, { target: { value: "5" } });
        expect(firstColumnValues()).toEqual(["5"]);
        fireEvent.change(idFilter, { target: { value: "" } });
        fireEvent.change(descFilter, { target: { value: "topic b" } });
        expect(firstColumnValues()).toEqual(["2"]);
    });

    it("el filtro global (con debounce) busca también en columnas ocultas", () => {
        vi.useFakeTimers();
        render(<TableWithPagination dataTable={makeRows(25)} columnsTable={makeColumns(() => {})} componentName="" />);
        fireEvent.change(screen.getByPlaceholderText("Global search"), { target: { value: "secret" } });
        act(() => {
            vi.advanceTimersByTime(250);
        });
        expect(firstColumnValues()).toEqual(["8"]);
        vi.useRealTimers();
    });

    it("ordena asc → desc → sin orden y no ordena al hacer clic en el filtro", () => {
        render(<TableWithPagination dataTable={makeRows(25)} columnsTable={makeColumns(() => {})} componentName="" />);
        const idHeader = screen.getByText("TopicId").closest("th")!;
        fireEvent.click(within(idHeader).getByPlaceholderText("Search"));
        expect(within(idHeader).queryByText(/[▲▼]/)).toBeNull();
        fireEvent.click(idHeader);
        expect(firstColumnValues()[0]).toBe("1");
        expect(idHeader.textContent).toContain("▲");
        fireEvent.click(idHeader);
        expect(firstColumnValues()[0]).toBe("25");
        expect(idHeader.textContent).toContain("▼");
        fireEvent.click(idHeader);
        expect(idHeader.textContent).not.toMatch(/[▲▼]/);
    });

    it("vuelve a la primera página al ordenar o filtrar (como v7)", () => {
        render(<TableWithPagination dataTable={makeRows(25)} columnsTable={makeColumns(() => {})} componentName="" />);
        fireEvent.click(screen.getByText(">"));
        expect(screen.getByText("2 of 3")).toBeInTheDocument();
        fireEvent.click(screen.getByText("Description").closest("th")!);
        expect(screen.getByText("1 of 3")).toBeInTheDocument();
        fireEvent.click(screen.getByText(">"));
        fireEvent.change(screen.getAllByPlaceholderText("Search")[2], { target: { value: "topic" } });
        expect(screen.getByText("1 of 3")).toBeInTheDocument();
    });

    it("volver a crear las columnas en cada render no reinicia la página y usa el último closure", () => {
        const calls: number[] = [];
        const Wrapper = () => {
            const [counter, setCounter] = useState(0);
            return (
                <>
                    <span onClick={() => setCounter((c) => c + 1)}>rerender</span>
                    <TableWithPagination
                        dataTable={rows}
                        columnsTable={makeColumns((id) => calls.push(id * 100 + counter))}
                        componentName=""
                    />
                </>
            );
        };
        const rows = makeRows(25);
        render(<Wrapper />);
        fireEvent.click(screen.getByText(">"));
        fireEvent.click(screen.getByText("rerender"));
        expect(screen.getByText("2 of 3")).toBeInTheDocument();
        fireEvent.click(screen.getByText("edit-11"));
        expect(calls).toEqual([1101]);
    });
});

describe("TableWithPaginationAndRowSelection", () => {
    const cols: Column<ITopicRow>[] = [
        { Header: "TopicId", accessor: "id", filter: "equals" },
        { Header: "Description", accessor: "description" },
    ];

    it("selección múltiple devuelve los elementos seleccionados", () => {
        const setSelectedItems = vi.fn();
        render(
            <TableWithPaginationAndRowSelection
                dataTable={makeRows(12)}
                columnsTable={cols}
                setSelectedItems={setSelectedItems}
                multipleSelection={true}
            />,
        );
        const checkboxes = screen.getAllByRole("checkbox");
        // cabecera + 10 filas de la página
        expect(checkboxes).toHaveLength(11);
        fireEvent.click(checkboxes[2]);
        fireEvent.click(checkboxes[4]);
        const last = setSelectedItems.mock.calls.at(-1)![0];
        expect(last.map((r: ITopicRow) => r.id)).toEqual([2, 4]);
        // seleccionar toda la página
        fireEvent.click(checkboxes[0]);
        expect(setSelectedItems.mock.calls.at(-1)![0]).toHaveLength(10);
    });

    it("selección única: preselecciona y al elegir otra fila deselecciona la anterior", () => {
        const setSelectedItem = vi.fn();
        const rows = makeRows(12);
        render(
            <TableWithPaginationAndRowSelection
                dataTable={rows}
                columnsTable={cols}
                selectedItem={rows[1]}
                setSelectedItem={setSelectedItem}
                multipleSelection={false}
            />,
        );
        expect(setSelectedItem.mock.calls.at(-1)![0].id).toBe(2);
        const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
        expect(checkboxes).toHaveLength(10);
        expect(checkboxes[1].checked).toBe(true);
        fireEvent.click(checkboxes[5]);
        expect(setSelectedItem.mock.calls.at(-1)![0].id).toBe(6);
        expect(checkboxes[1].checked).toBe(false);
        expect(checkboxes[5].checked).toBe(true);
    });
});

describe("TableWithPaginationAsync (paginación en servidor)", () => {
    it("pide los datos por página y respeta pageCount", () => {
        const fetchData = vi.fn();
        const cols: Column<any>[] = [
            { Header: "Timestamp", accessor: "timestamp" },
            { Header: "Topic", accessor: "topic" },
        ];
        const data = Array.from({ length: 10 }, (_, i) => ({ timestamp: `t${i}`, topic: "hidden" }));
        render(
            <TableWithPaginationAsync
                data={data}
                columns={cols}
                fetchData={fetchData}
                refreshMeasurements={() => {}}
                measurementTopic=""
                loading={false}
                pageCount={2}
                showMeasurementSelectionTable={() => {}}
                selectedSensor={{} as any}
                selectedTimeRange=""
                setSelectedTimeRange={() => {}}
                setStartDate={() => {}}
                setEndDate={() => {}}
            />,
        );
        expect(fetchData).toHaveBeenLastCalledWith(0, 10);
        expect(bodyRows()).toHaveLength(10);
        expect(screen.queryByText("Topic")).not.toBeInTheDocument();
        fireEvent.click(screen.getByText(">"));
        expect(fetchData).toHaveBeenLastCalledWith(1, 10);
        expect((screen.getByText(">") as HTMLButtonElement).disabled).toBe(true);
    });
});
