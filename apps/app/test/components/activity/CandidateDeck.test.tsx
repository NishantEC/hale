import { render, fireEvent, act } from "@testing-library/react-native"
import { CandidateDeck } from "../../../app/components/activity/CandidateDeck"

const makeCard = (id: string) => ({
  id,
  startTime: new Date("2026-05-17T09:15:00"),
  endTime: new Date("2026-05-17T09:33:00"),
  durationMinutes: 18,
  heartRateAvg: 132,
  heartRateMax: 158,
  confidence: 0.72,
  suggestedType: "Strength",
  hrSparkline: [0.2, 0.4, 0.5, 0.6, 0.5, 0.7, 0.8, 0.7, 0.6],
})

describe("CandidateDeck", () => {
  it("renders nothing when cards is empty", () => {
    const { toJSON } = render(
      <CandidateDeck cards={[]} onConfirm={async () => {}} onDismiss={async () => {}} />,
    )
    expect(toJSON()).toBeNull()
  })

  it("renders single card without deck chrome", () => {
    const { queryByText } = render(
      <CandidateDeck cards={[makeCard("c1")]} onConfirm={async () => {}} onDismiss={async () => {}} />,
    )
    expect(queryByText(/of /i)).toBeNull()
  })

  it("renders pager line when cards.length >= 2", () => {
    const { getByText } = render(
      <CandidateDeck
        cards={[makeCard("a"), makeCard("b"), makeCard("c")]}
        onConfirm={async () => {}}
        onDismiss={async () => {}}
      />,
    )
    expect(getByText(/1 of 3/i)).toBeTruthy()
  })

  it("calls onConfirm with the top card id and chosen type", async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined)
    const { getByText } = render(
      <CandidateDeck
        cards={[makeCard("a"), makeCard("b")]}
        onConfirm={onConfirm}
        onDismiss={async () => {}}
      />,
    )
    await act(async () => {
      fireEvent.press(getByText("Confirm"))
    })
    expect(onConfirm).toHaveBeenCalledWith("a", "Strength")
  })
})
