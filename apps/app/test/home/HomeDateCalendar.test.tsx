import { render } from "@testing-library/react-native"
import { HomeDateCalendar } from "@/components/home/HomeDateCalendar"

// react-native-calendars pulls in some platform-only modules during import;
// stub them out at the module level since we're only checking the custom day
// renderer's marker output, not the library's own UI.
jest.mock("react-native-calendars", () => {
  const React = require("react")
  const { View } = require("react-native")
  return {
    Calendar: ({ dayComponent }: any) => {
      // Render the dates we want the test to inspect via the custom day
      // component, with the bare minimum of DateData props the component reads.
      const days = ["2026-05-13", "2026-05-17"]
      return (
        <View>
          {days.map((dateString) => {
            const [, mm, dd] = dateString.split("-")
            return React.createElement(dayComponent, {
              key: dateString,
              date: { dateString, day: Number(dd), month: Number(mm), year: 2026, timestamp: 0 },
              state: "",
            })
          })}
        </View>
      )
    },
  }
})

describe("HomeDateCalendar", () => {
  test("renders a full-coverage marker for a full day", () => {
    const { getByTestId } = render(
      <HomeDateCalendar
        selectedDate="2026-05-17"
        monthCursor="2026-05"
        coverageByDate={{ "2026-05-17": "full" }}
        onSelectDate={jest.fn()}
        onMonthCursorChange={jest.fn()}
        onClose={jest.fn()}
      />,
    )
    const bar = getByTestId("day-marker-2026-05-17")
    expect(bar.props.accessibilityLabel).toMatch(/full/i)
  })

  test("renders a partial-coverage marker for a partial day", () => {
    const { getByTestId } = render(
      <HomeDateCalendar
        selectedDate="2026-05-17"
        monthCursor="2026-05"
        coverageByDate={{ "2026-05-13": "partial" }}
        onSelectDate={jest.fn()}
        onMonthCursorChange={jest.fn()}
        onClose={jest.fn()}
      />,
    )
    const bar = getByTestId("day-marker-2026-05-13")
    expect(bar.props.accessibilityLabel).toMatch(/partial/i)
  })
})
