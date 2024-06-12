# 根据传入的路径读取excel加载到pandas中
# 然后遍历每一行，生成一个对应的数据对象，最后存入为一个.ts文件，如"export const aiAssistantState = [{...}]"

import pandas as pd
import os
import sys
import json
import re

# 读取excel
# 第二行开始，第二行作为列名
def read_excel(file_path):
    df = pd.read_excel(file_path, header=1)
    return df

# 生成python中间数组对象
def generate_data(df):
    # 把df对象转成如[{id: 1, name: 'xxx'}, {id: 2, name: 'yyy'}]的形式,id和name是列名
    # 把NaN转成''，因为json.dumps会把NaN转成null
    data = []
    for index, row in df.iterrows():
        item = {}
        for col in df.columns:
            item[col] = row[col] if pd.notnull(row[col]) else ''
        data.append(item)
    return data

# 保存为ts文件
def save_ts_file(data, file_path):
    # 生成ts文件
    with open(file_path, 'w', encoding='utf8') as f:
        f.write("export const aiAssistantStates = ")
        f.write(json.dumps(data, indent=4, ensure_ascii=False))
    

if __name__ == "__main__":
    # 使用argparse解析命令行参数
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", help="excel文件路径")

    args = parser.parse_args()
    if not args.path:
        print("请传入excel文件路径")
        sys.exit(1)
    file_path = args.path
    df = read_excel(file_path)
    data = generate_data(df)
    # 生成ts文件
    file_name = os.path.basename(file_path)
    file_name = re.sub(r"\.xlsx", "", file_name)
    save_ts_file(data, f"{file_name}.ts")
