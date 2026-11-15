"""Static regression checks for submitted-question rendering in FireMap."""
from pathlib import Path


SOURCE = (Path(__file__).resolve().parents[1] / "web/src/screens/FireMap.tsx").read_text()

assert "const [aiSubmittedQuestion, setAiSubmittedQuestion] = useState(\"\");" in SOURCE
assert "setAiSubmittedQuestion(submittedQuestion);" in SOURCE
assert "`Pertanyaan: \"${aiSubmittedQuestion}\"`" in SOURCE
assert "onChange={(e) => setAiQuestion(e.target.value)}" in SOURCE
assert "triggerAiAnalysis(target, submittedQuestion || undefined);" in SOURCE