# %% 0 · Sessiya 1 · Python practice — Data Science Academy, Statistics & Machine Learning
# Alətlər: Python, Google Colab, Jupyter Notebook, NumPy, Pandas, Matplotlib, Seaborn, Claude və ChatGPT.
# Hər hissə ayrıca cell-dir: yuxarıdan aşağı Run edin (Shift + Enter).
print("Salam, Data Science!")

# %% 1 · Sintaksis, dəyişənlər, operatorlar və əsas data tipləri
age, salary, name, is_student = 25, 1500.5, "Aysel", True    # int, float, str, bool
print(type(age), type(salary), type(name), type(is_student))
print(age + 5, salary * 2, 17 // 5, 17 % 5, 2 ** 3, age > 18 and is_student)
print(name.upper(), name[0], name[::-1], f"{name} {age} yaşındadır")

# %% 2 · List, tuple, dictionary
scores = [70, 85, 92, 58]                          # list: dəyişə bilər
scores.append(77)
scores.sort()
point = (40.4, 49.9)                               # tuple: dəyişməz
student = {"name": "Aysel", "scores": scores}      # dictionary: key → value
student["city"] = "Baku"
print(scores, scores[-1], scores[1:3], len(scores), point[0])
print(student.keys(), student["city"])

# %% 3 · Şərti ifadələr (if / elif / else) və dövrlər (for, while)
for s in scores:
    if s >= 90:
        grade = "A"
    elif s >= 70:
        grade = "B"
    else:
        grade = "C"
    print(s, grade)
i = 0
while i < 3:
    i += 1
print("while bitdi, i =", i)

# %% 4 · Funksiyalar: def, lambda, map, filter, zip
def result(s, pass_mark=60):                       # def: adı, parametri, default dəyəri var
    return "keçdi" if s >= pass_mark else "kəsildi"

square = lambda x: x ** 2                          # lambda: bir sətirlik, adsız funksiya
names = ["Aysel", "Rustam", "Leyla", "Kamran", "Nigar"]
print(list(map(result, scores)))                   # map: hər elementə funksiya tətbiq edir
print(list(map(square, [1, 2, 3])))
print(list(filter(lambda s: s >= 75, scores)))     # filter: True olanları saxlayır
print(dict(zip(names, scores)))                    # zip: iki siyahını cütləyir

# %% 5 · Xətalarla işləmə (error handling): try / except / finally
for x in [5, 0, "a"]:
    try:
        print(10 / x)
    except ZeroDivisionError:
        print("0-a bölmək olmaz")
    except TypeError as e:
        print("Tip xətası:", e)
    finally:
        print("yoxlandı:", x)

# %% 6 · NumPy: array, shape, indexing, riyazi əməliyyatlar
import numpy as np
a = np.array([[1, 2, 3], [4, 5, 6]])
print(a.shape, a.dtype, a[1, 2], a[:, 0])
print(a * 10)
print(a.mean(), a.sum(axis=0), np.arange(0, 10, 2), np.zeros((2, 2)))

# %% 7 · Pandas: Series, DataFrame və məlumatların oxunması
import pandas as pd
s = pd.Series(scores, index=names)                 # Series: bir sütun + index
print(s, "\nmean:", s.mean())
try:
    hr = pd.read_csv("/data.csv")                  # Lab: Data workspace-dəki fayl
except FileNotFoundError:
    hr = pd.read_csv("HR_Analytics_data.csv")      # Colab / Jupyter: faylı əvvəlcə yükləyin
hr.head()

# %% 8 · İlkin emal: info, boş dəyərlər, təkrarlar, lazımsız sütunlar, yeni sütun
hr.info()
print("shape:", hr.shape, "| boş dəyər:", hr.isnull().sum().sum(), "| təkrar sətir:", hr.duplicated().sum())
hr = hr.drop(columns=["EmployeeCount", "StandardHours", "Over18"], errors="ignore").drop_duplicates()
hr["AgeGroup"] = pd.cut(hr["Age"], bins=[17, 30, 45, 60], labels=["18-30", "31-45", "46-60"])
hr.describe().round(1)

# %% 9 · Seçmə, filter və groupby
print(hr.loc[hr["Age"] < 25, ["Age", "Department", "MonthlyIncome"]].head())
print(hr["Department"].value_counts())
hr.groupby("Department")["MonthlyIncome"].agg(["mean", "median", "count"]).round(0)

# %% 10 · Vizuallaşdırma: Matplotlib (və Seaborn)
import matplotlib.pyplot as plt
fig, ax = plt.subplots(1, 3, figsize=(15, 4))
ax[0].hist(hr["Age"], bins=20)
ax[0].set_title("Age · histogram")
hr["Department"].value_counts().plot.bar(ax=ax[1], title="Department · bar")
ax[2].scatter(hr["TotalWorkingYears"], hr["MonthlyIncome"], s=8)
ax[2].set_title("TotalWorkingYears vs MonthlyIncome")
plt.tight_layout()
plt.show()
try:
    import seaborn as sns                          # Colab / Jupyter-də var
    sns.boxplot(data=hr, x="Department", y="MonthlyIncome")
except ImportError:                                # Lab-da Seaborn yoxdur → Pandas boxplot
    hr.boxplot(column="MonthlyIncome", by="Department", figsize=(8, 4))
plt.show()

# %% 11 · AI ilə işləmək: Claude və ChatGPT
# Prompt nümunəsi: "hr DataFrame-də Department üzrə Attrition faizini hesablayan pandas kodu yaz və izah et."
# AI-ın verdiyi kodu oxuyun, işlədin, nəticəni yoxlayın:
(hr["Attrition"] == "Yes").groupby(hr["Department"]).mean().mul(100).round(1)
