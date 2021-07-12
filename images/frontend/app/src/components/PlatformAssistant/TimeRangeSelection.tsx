import { FC } from 'react';
import styled from "styled-components";
import Select, { ValueType } from "react-select";
import timeRangeCalculator from '../../tools/timeRangeCalculator';


const SelectContainer = styled.div`
    width: 200px;
`;

const customStyles = {
    option: (provided: any, state: any) => ({
        ...provided,
        borderBottom: '2px solid #2c3235',
        color: 'white',
        padding: 15,
        fontSize: '14px',
        backgroundColor: '#35383d',
        "&:hover": {
            cursor: 'pointer',
            backgroundColor: '#0c0d0f',
        }
    }),
    control: (provided: any, state: any) => ({
        ...provided,
        fontSize: '14px',
        border: '2px solid #2c3235',
        backgroundColor: '#0c0d0f',
        margin: '0 auto',
        width: '100%',
        height: 30,
        minHeight: 30,
        borderRadius: 0,
        "&:hover": {
            boxShadow: 'rgb(20 22 25) 0px 0px 0px 2px, rgb(31 96 196) 0px 0px 0px 4px'
        },
        "& > div": {
            height: 26,
            minHeight: 26,
            padding: '2px 0'
        },
        "& > div > div": {
            padding: '5px'
        }
    }),
    dropdownIndicator: (provided: any, state: any) => ({
        ...provided,
        color: 'white',
    }),
    valueContainer: (provided: any, state: any) => ({
        ...provided,
        "& > div > div": {
            opacity: '0'
        }
    }),
    indicatorsContainer: (provided: any, state: any) => ({
        ...provided,
        height: 26,
        minHeight: 26,
    }),
    indicatorSeparator: (provided: any, state: any) => ({
        ...provided,
        backgroundColor: '#2c3235',
        width: '2px'
    }),
    menu: (provided: any, state: any) => ({
        ...provided,
        backgroundColor: '#35383d',
        width: 'calc(100% + 3px)',
    }),
    menuList: (provided: any, state: any) => ({
        ...provided,
        width: '100%',
        "::-webkit-scrollbar": {
            width: "10px"
        },
        "::-webkit-scrollbar-track": {
            background: "#141619",
            borderRadius: "5px"
        },
        "::-webkit-scrollbar-thumb": {
            background: "#444d52",
            borderRadius: "5px"
        },
        "::-webkit-scrollbar-thumb:hover": {
            background: "#5a5d61"
        }
    }),
    singleValue: (provided: any, state: any) => {
        const color = 'white';
        return { ...provided, color };
    }
}

interface IOption {
    value: string | boolean;
    label: string;
}

const timeRangeOptions = [
    {
        label: "Last minute",
        value: "Last minute"
    },
    {
        label: "Last 5 minutes",
        value: "Last 5 minutes"
    },
    {
        label: "Last 15 minutes",
        value: "Last 15 minutes"
    },
    {
        label: "Last 30 minutes",
        value: "Last 30 minutes"
    },
    {
        label: "Last hour",
        value: "Last hour"
    },
    {
        label: "Last 2 hours",
        value: "Last 2 hours"
    },
    {
        label: "Last 6 hours",
        value: "Last 6 hours"
    },
    {
        label: "Last 12 hours",
        value: "Last 12 hours"
    },
    {
        label: "Last day",
        value: "Last day"
    },
    {
        label: "Last week",
        value: "Last week"
    },
    {
        label: "Last month",
        value: "Last month"
    },
    {
        label: "Last 2 months",
        value: "Last 2 months"
    },
    {
        label: "Last 6 months",
        value: "Last 6 months"
    },
    {
        label: "Last year",
        value: "Last year"
    },
];

interface TimeRangeSelectionProps {
    selectedTimeRange: string;
    setSelectedTimeRange: (selectedTimeRange: string) => void;
    setStartDate: (startDateString: string) => void;
    setEndDate: (endDateString: string) => void;
}

export const TimeRangeSelection: FC<TimeRangeSelectionProps> = (
    {
        selectedTimeRange,
        setSelectedTimeRange,
        setStartDate,
        setEndDate
    }) => {

    const onChange = (option: ValueType<IOption, false>) => {
        const selectedTimeRange = (option as IOption).value as string;
        setSelectedTimeRange(selectedTimeRange);
        const [startDateString, endDateString] = timeRangeCalculator(selectedTimeRange);
        setStartDate(startDateString);
        setEndDate(endDateString);
    };

    const getValue = () => {
        if (timeRangeOptions) {
            return timeRangeOptions.find((option: IOption) => option.value === selectedTimeRange);
        } else {
            return ("" as any);
        }
    };

    return (
        <SelectContainer>
            <Select
                styles={customStyles}
                value={getValue()}
                onChange={onChange}
                placeholder="Select time range"
                options={timeRangeOptions}
                isMulti={false}
            />
        </SelectContainer>
    );
};
